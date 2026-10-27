import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, frasesAgente, idProyecto, urlHttps } from '@/lib/agente'
import { notificar } from '@/lib/push'
import { DISENOS, disenoValido } from '@/lib/prueba-gratis'
import { pasadaDelProyecto, proyectoAgente } from '@/lib/primera-version'
import { prepararEmailProyecto } from '@/lib/emails-proyecto'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })
const REF = /^[a-z0-9][a-z0-9-]{0,59}$/
// Cartela: el QR viene en base64 en el propio cuerpo (≤ 300 KB de PNG), así que el límite es mayor.
const MAX_QR = 300 * 1024, MAX_CUERPO = 512 * 1024
// Platos que caben en cada plan de Cartela (servicio-y-planes.md): si los supera, aviso en la ficha.
const PLATOS_PLAN: Record<string, number> = { carta: 40 }

// El agente publicó la primera versión (diseño, custom o treatment) en una vista previa privada (solo para
// Joel): evento `web.lista` (uno por proyecto y pasada, índice único) y push. No cambia la fase ni prepara emails: la ronda R1 para el
// cliente la abre Joel con arkevo-revision, y eso deja el borrador `revision.lista`.
// Carta de Cartela (sin herramienta de revisión): la `url` queda en `cartela_locales.url_carta`, el `qr_png`
// (base64) en el bucket `cartela`, en qr/<slug>.png, y se prepara el email de primera versión (`revision.lista`)
// con la URL y el QR, para que Joel lo revise y lo envíe. `platos` sirve para avisar si no caben en su plan.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req, MAX_CUERPO)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const id = idProyecto(b.proyecto_id)
  if (!id) return json({ error: 'proyecto_invalido', campo: 'proyecto_id' }, 400)
  const url = urlHttps(b.url)
  if (!url) return json({ error: 'url_invalida', campo: 'url' }, 400)
  if (b.diseno != null && !disenoValido(b.diseno)) return json({ error: 'diseno_invalido', campo: 'diseno', validos: DISENOS }, 400)
  const notas = frasesAgente(b.notas)
  if (!notas) return json({ error: 'notas_invalidas', campo: 'notas' }, 400)
  const paginas = b.paginas == null ? [] : Array.isArray(b.paginas) && b.paginas.length <= 30 && b.paginas.every(x => typeof x === 'string' && x.startsWith('/') && x.length <= 200) ? b.paginas as string[] : null
  if (!paginas) return json({ error: 'paginas_invalidas', campo: 'paginas' }, 400)
  const ref = b.ref == null ? null : typeof b.ref === 'string' && REF.test(b.ref) ? b.ref : undefined
  if (ref === undefined) return json({ error: 'ref_invalida', campo: 'ref' }, 400)
  const qr = b.qr_png == null ? null : typeof b.qr_png === 'string' ? Buffer.from(b.qr_png.replace(/^data:image\/png;base64,/, ''), 'base64') : undefined
  if (qr === undefined || (qr && (qr.length > MAX_QR || qr.length < 8 || qr.readUInt32BE(0) !== 0x89504e47))) return json({ error: 'qr_invalido', campo: 'qr_png' }, 400)
  const platos = b.platos == null ? null : Number.isInteger(b.platos) && (b.platos as number) > 0 && (b.platos as number) < 2000 ? b.platos as number : undefined
  if (platos === undefined) return json({ error: 'platos_invalidos', campo: 'platos' }, 400)

  try {
    const r = await proyectoAgente(id)
    if ('error' in r) return json({ error: r.error }, r.status)
    if (!r.estado) return json({ error: 'sin_encargo' }, 409)
    const { p } = r
    const diseno = disenoValido(b.diseno)
    // La pasada que estaba montando (si llegó material nuevo mientras tanto, la siguiente sigue pendiente).
    const pasada = await pasadaDelProyecto(p.id)
    const carta = r.estado.tipo === 'carta'
    const { data: local } = carta ? await sb.from('cartela_locales').select('id, slug, nombre, plan').eq('proyecto_id', p.id).maybeSingle() : { data: null }
    if (carta && !local) return json({ error: 'sin_local' }, 409)
    // Aviso de plan: más platos de los que caben en el suyo.
    const limite = local?.plan ? PLATOS_PLAN[String(local.plan).toLowerCase()] : undefined
    if (platos && limite && platos > limite) notas.push(`${platos} platos y bebidas: el plan ${local!.plan} llega a ${limite}. Toca el plan Casa.`)
    const { error: dup } = await sb.from('eventos').insert({
      proyecto_id: p.id, lead_id: p.lead_id, tipo: 'web.lista', fuente: 'agente-web',
      datos: { url, tipo: r.estado.tipo, pasada, ...(platos ? { platos } : {}), ...(diseno ? { diseno } : {}), ...(paginas.length ? { paginas } : {}), ...(notas.length ? { notas } : {}), ...(ref ? { ref } : {}) },
    })
    // Ya avisada (índice eventos_web_lista_pasada): no se toca nada.
    if (dup) { if (dup.code !== '23505') throw new Error(dup.message); return json({ duplicado: true }, 200) }

    // La ref de revisión: si el proyecto aún no tiene y nadie más la usa, se guarda (así el `enable` de
    // arkevo-revision encaja solo con este proyecto).
    let refGuardada = false
    if (ref && !p.ref_entrega) {
      const { count } = await sb.from('proyectos').select('id', { count: 'exact', head: true }).eq('ref_entrega', ref)
      if (!count) refGuardada = !(await sb.from('proyectos').update({ ref_entrega: ref }).eq('id', p.id).is('ref_entrega', null)).error
    }
    // Carta: URL y QR al local (el QR se usa en la entrega), y el email de revisión listo para enviar (o enviado, si es automático y sin notas).
    let email: unknown = null
    if (carta && local) {
      await sb.from('cartela_locales').update({ url_carta: url }).eq('id', local.id)
      if (qr) {
        const { error: errQr } = await sb.storage.from('cartela').upload(`qr/${local.slug}.png`, qr, { contentType: 'image/png', upsert: true })
        if (errQr) console.error('agente/web-lista qr', errQr.message)
      }
      // Revisión (Joel, 2026-10-27): el email lleva solo la carta (el QR y el enlace de cambios van con la entrega). Con
      // notas del agente queda en borrador: Joel añade las preguntas para el local antes de enviarlo.
      email = await prepararEmailProyecto(p.id, 'revision.lista', { url, vars: { corregida: pasada > 1 ? 'sí' : null } }, 'agente-web', notas.length ? { auto: false } : {})
        .catch(e => ({ error: e?.message }))
      await notificar({
        titulo: `${pasada > 1 ? 'Versión corregida' : 'Primera versión'} de ${local.nombre || p.cliente} lista${pasada > 1 ? ` · pasada ${pasada}` : ''}`,
        cuerpo: notas.length ? `Mira las ${notas.length} nota${notas.length === 1 ? '' : 's'} del agente y envía el email de revisión.` : 'El email de revisión ha salido solo.',
        url: `/proyectos/${p.id}`, etiqueta: `proyecto-${p.id}`,
      }).catch(e => console.error('agente/web-lista push', e?.message))
      return json({ ok: true, pasada, url_guardada: true, qr_guardado: !!qr, email }, 201)
    }
    await notificar({
      titulo: `${r.estado.tipo === 'diseno' ? 'Primera versión' : r.estado.tipo === 'custom' ? 'Web custom' : 'Treatment'} de ${p.cliente} ${r.estado.tipo === 'treatment' ? 'listo' : 'lista'} para revisar${pasada > 1 ? ` · pasada ${pasada}` : ''}`,
      cuerpo: `${diseno ? `${diseno} · ` : ''}${url}${notas.length ? ` · ${notas.length} nota${notas.length === 1 ? '' : 's'} del agente` : ''}`,
      url: '/proyectos',
      etiqueta: `proyecto-${p.id}`,
    }).catch(e => console.error('agente/web-lista push', e?.message))
    return json({ ok: true, pasada, ref_guardada: refGuardada }, 201)
  } catch (e: any) {
    console.error('agente/web-lista', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
