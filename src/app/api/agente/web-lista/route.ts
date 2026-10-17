import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, frasesAgente, idProyecto, urlHttps } from '@/lib/agente'
import { notificar } from '@/lib/push'
import { DISENOS, disenoValido } from '@/lib/prueba-gratis'
import { proyectoAgente } from '@/lib/primera-version'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })
const REF = /^[a-z0-9][a-z0-9-]{0,59}$/

// El agente publicó la primera versión en una vista previa privada (solo para Joel): evento `web.lista`
// (uno por proyecto, índice único) y push. No cambia la fase ni prepara emails: la ronda R1 para el
// cliente la abre Joel con arkevo-revision, y eso deja el borrador `revision.lista`.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req)
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

  try {
    const r = await proyectoAgente(id)
    if ('error' in r) return json({ error: r.error }, r.status)
    if (!r.estado) return json({ error: 'sin_encargo' }, 409)
    const { p } = r
    const diseno = disenoValido(b.diseno)
    const { error: dup } = await sb.from('eventos').insert({
      proyecto_id: p.id, lead_id: p.lead_id, tipo: 'web.lista', fuente: 'agente-web',
      datos: { url, ...(diseno ? { diseno } : {}), ...(paginas.length ? { paginas } : {}), ...(notas.length ? { notas } : {}), ...(ref ? { ref } : {}) },
    })
    // Ya avisada (índice eventos_web_lista_unica): no se toca nada.
    if (dup) { if (dup.code !== '23505') throw new Error(dup.message); return json({ duplicado: true }, 200) }

    // La ref de revisión: si el proyecto aún no tiene y nadie más la usa, se guarda (así el `enable` de
    // arkevo-revision encaja solo con este proyecto).
    let refGuardada = false
    if (ref && !p.ref_entrega) {
      const { count } = await sb.from('proyectos').select('id', { count: 'exact', head: true }).eq('ref_entrega', ref)
      if (!count) refGuardada = !(await sb.from('proyectos').update({ ref_entrega: ref }).eq('id', p.id).is('ref_entrega', null)).error
    }
    await notificar({
      titulo: `Primera versión de ${p.cliente} lista para revisar`,
      cuerpo: `${diseno ? `${diseno} · ` : ''}${url}${notas.length ? ` · ${notas.length} nota${notas.length === 1 ? '' : 's'} del agente` : ''}`,
      url: '/proyectos',
      etiqueta: `proyecto-${p.id}`,
    }).catch(e => console.error('agente/web-lista push', e?.message))
    return json({ ok: true, ref_guardada: refGuardada }, 201)
  } catch (e: any) {
    console.error('agente/web-lista', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
