import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'
import { MAX_BYTES_INTAKE, fuenteDeClave } from '@/lib/intake'
import { prepararEmailProyecto } from '@/lib/emails-proyecto'
import type { FaseProyecto } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Avisos de los sistemas de revisión (arkevo-revision y Pitchview), de servidor a servidor. Pública
// en el middleware: se protege con una clave por fuente. `ref` = proyectos.ref_entrega.
// Contrato en automatizacion.md («POST /api/intake/evento»). Repetir un aviso no duplica nada.
// White-label: la respuesta solo lleva ids y estados; Pitchview no pinta nada de lo que devuelve.
const FUENTES = [
  // arkevo-revision sirve a todas las webs (marcas de precio cerrado); Pitchview solo a los treatments de The Pitch Lab.
  { env: 'INTAKE_KEY_REVISION', fuente: 'arkevo-revision', marcas: null },
  { env: 'INTAKE_KEY_PITCHVIEW', fuente: 'pitchview', marcas: ['pitchlab'] },
] as const
const TIPOS = ['revision.ronda_abierta', 'revision.comentarios_enviados', 'revision.ronda_cerrada', 'entrega.final'] as const
type Tipo = typeof TIPOS[number]

const json = (body: unknown, status: number) => NextResponse.json(body, { status })
const invalido = (error: string, campo: string) => json({ error, campo }, 400)
const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

function urlHttps(v: unknown) {
  if (typeof v !== 'string' || v.length > 2000) return null
  try { const u = new URL(v); return u.protocol === 'https:' ? u.toString() : null } catch { return null }
}

export async function POST(req: NextRequest) {
  const fuente = fuenteDeClave(req.headers.get('authorization'), FUENTES)
  if (!fuente) return json({ error: 'no_autorizado' }, 401)

  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES_INTAKE) return json({ error: 'demasiado_grande' }, 413)
  const crudo = await req.text()
  if (Buffer.byteLength(crudo) > MAX_BYTES_INTAKE) return json({ error: 'demasiado_grande' }, 413)

  let b: unknown
  try { b = JSON.parse(crudo) } catch { return invalido('json_invalido', '') }
  if (!esObjeto(b)) return invalido('json_invalido', '')

  const tipo = b.tipo as Tipo
  if (!TIPOS.includes(tipo)) return invalido('tipo_invalido', 'tipo')
  const ref = typeof b.ref === 'string' ? b.ref.trim() : ''
  if (!ref || ref.length > 200 || /\s/.test(ref)) return invalido('ref_invalida', 'ref')
  const ronda = typeof b.ronda === 'string' ? b.ronda.trim() : ''
  if (tipo.startsWith('revision.') && (!ronda || ronda.length > 20)) return invalido('ronda_invalida', 'ronda')
  const url = b.url == null ? null : urlHttps(b.url)
  if (b.url != null && !url) return invalido('url_invalida', 'url')
  if (tipo === 'revision.ronda_abierta' && !url) return invalido('url_invalida', 'url')
  if (b.datos != null && !esObjeto(b.datos)) return invalido('campo_invalido', 'datos')
  const datos = (b.datos ?? {}) as Record<string, unknown>
  const comentarios = typeof datos.comentarios === 'number' && datos.comentarios >= 0 ? Math.floor(datos.comentarios) : null
  const detalle = { ref, ...(ronda ? { ronda } : {}), ...(url ? { url } : {}), ...datos }

  try {
    const { data: p } = await sb.from('proyectos').select('id, nombre, cliente, marca, fase, lead_id').eq('ref_entrega', ref).maybeSingle()
    const { data: marca } = p ? await sb.from('marcas').select('nombre, modo').eq('key', p.marca ?? '').maybeSingle() : { data: null }
    const esWeb = marca?.modo === 'cerrado'
    const permitido = !!p && (fuente.marcas ? (fuente.marcas as readonly string[]).includes(p.marca ?? '') : esWeb)

    if (!p || !permitido) {
      // Se guarda sin proyecto para enlazarlo a mano (y Joel se entera); a la fuente solo le llega el 404.
      await sb.from('eventos').insert({ tipo, fuente: fuente.fuente, datos: detalle })
      await notificar({ titulo: `Aviso sin proyecto · ${fuente.fuente}`, cuerpo: `${tipo} · ref «${ref}». Ponla en el proyecto desde /proyectos.`, url: '/proyectos' }).catch(e => console.error('intake/evento push', e?.message))
      return json({ error: 'ref_desconocida' }, 404)
    }

    const evento = (t: string, d: Record<string, unknown>) => sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: t, fuente: fuente.fuente, datos: d })
    // Solo las webs se siguen por etapas; los treatments no llevan fase.
    const ponerFase = async (fase: FaseProyecto) => {
      if (!esWeb || p.fase === fase) return
      await sb.from('proyectos').update({ fase }).eq('id', p.id)
      await evento('proyecto.fase', { de: p.fase, a: fase })
    }
    const avisar = (titulo: string, cuerpo: string) => notificar({ titulo, cuerpo, url: esWeb ? '/proyectos' : '/', etiqueta: `proyecto-${p.id}` })
      .catch(e => console.error('intake/evento push', e?.message))
    const quien = `${p.cliente} · ${p.nombre}`
    const { data: rev } = ronda
      ? await sb.from('revisiones').select('id, estado').eq('proyecto_id', p.id).eq('ronda', ronda).maybeSingle()
      : { data: null }

    if (tipo === 'revision.ronda_abierta') {
      if (rev) return json({ id: rev.id, estado: rev.estado, duplicado: true }, 200)
      const { data: nueva, error } = await sb.from('revisiones').insert({ proyecto_id: p.id, ronda, url, comentarios: comentarios ?? 0 }).select('id, estado').single()
      if (error) {
        // Dos avisos a la vez: el segundo choca con UNIQUE (proyecto_id, ronda).
        if (error.code === '23505') return json({ duplicado: true }, 200)
        throw new Error(error.message)
      }
      await evento(tipo, detalle)
      await ponerFase('revision')
      if (esWeb) {
        const r = await prepararEmailProyecto(p.id, 'revision.lista', { ronda, url: url! }, fuente.fuente)
        if ('error' in r) console.error('intake/evento email', r.error)
        if ('borrador' in r) await avisar(`Ronda ${ronda} abierta · ${quien}`, 'Email «Revisión lista» preparado: revísalo y envíalo.')
        if ('enviado' in r) await avisar(`Ronda ${ronda} abierta · ${quien}`, 'Email «Revisión lista» enviado al cliente.')
      }
      return json({ id: nueva.id, estado: nueva.estado }, 201)
    }

    if (tipo === 'revision.comentarios_enviados') {
      if (rev && rev.estado !== 'abierta') {
        if (comentarios != null) await sb.from('revisiones').update({ comentarios }).eq('id', rev.id)
        return json({ id: rev.id, estado: rev.estado, duplicado: true }, 200)
      }
      const cambios = { estado: 'comentada', comentada_en: new Date().toISOString(), ...(comentarios != null ? { comentarios } : {}) }
      const { data: fila, error } = rev
        ? await sb.from('revisiones').update(cambios).eq('id', rev.id).select('id, estado').single()
        : await sb.from('revisiones').insert({ proyecto_id: p.id, ronda, url: url || '', ...cambios }).select('id, estado').single()
      if (error) throw new Error(error.message)
      await evento(tipo, detalle)
      await ponerFase('cambios')
      // Con los comentarios dentro, el recordatorio pendiente ya no hace falta.
      await sb.from('mensajes').update({ estado: 'descartado' }).eq('proyecto_id', p.id).eq('plantilla', 'revision.recordatorio').eq('estado', 'borrador')
      await avisar(`Comentarios · ${quien}`, `Ronda ${ronda}${comentarios != null ? ` · ${comentarios} comentario${comentarios === 1 ? '' : 's'}` : ''}. Toca aplicar los cambios.`)
      return json({ id: fila.id, estado: fila.estado }, 200)
    }

    if (tipo === 'revision.ronda_cerrada') {
      if (rev?.estado === 'cerrada') return json({ id: rev.id, estado: rev.estado, duplicado: true }, 200)
      const { data: fila, error } = rev
        ? await sb.from('revisiones').update({ estado: 'cerrada' }).eq('id', rev.id).select('id, estado').single()
        : await sb.from('revisiones').insert({ proyecto_id: p.id, ronda, url: url || '', estado: 'cerrada' }).select('id, estado').single()
      if (error) throw new Error(error.message)
      await evento(tipo, detalle)
      return json({ id: fila.id, estado: fila.estado }, 200)
    }

    // entrega.final: una sola vez por proyecto.
    const { count } = await sb.from('eventos').select('id', { count: 'exact', head: true }).eq('proyecto_id', p.id).eq('tipo', 'entrega.final')
    if (count) return json({ duplicado: true }, 200)
    await evento(tipo, detalle)
    await ponerFase('entregado')
    if (esWeb) {
      const r = await prepararEmailProyecto(p.id, 'entrega.final', { url: url || undefined }, fuente.fuente)
      if ('error' in r) console.error('intake/evento email', r.error)
      await avisar(`Entrega final · ${quien}`, `${'enviado' in r ? 'Email de entrega enviado' : 'Email de entrega preparado'}. Factura el pago 2 desde Webs.`)
    } else {
      await avisar(`Entrega final · ${quien}`, 'El cliente ya tiene la entrega final.')
    }
    return json({ ok: true }, 200)
  } catch (e: any) {
    console.error('intake/evento', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
