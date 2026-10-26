// Agente de cambios de Cartela (piloto automático, 2026-10-26; contrato en automatizacion.md § «Agente de cambios
// de Cartela»). Recoge las peticiones de la bandeja (las de /cambios/<token> y las que el piloto saca de los emails),
// las aplica con el motor y responde: hecho (publicada + nota + email al cliente en su hilo) o escalada (para Joel).
// Solo con el paso «Cambios» del piloto encendido en Cartela; si se apaga, la bandeja vuelve a ser solo de Joel.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { pilotoActivo } from '@/lib/autonomia'
import { notificar } from '@/lib/push'
import { firmarAdjuntos } from '@/lib/cartela-cambios'
import { prepararEmailProyecto } from '@/lib/emails-proyecto'

// Una petición «en curso» que el agente no cerró en este tiempo vuelve a salir (la pasada se cortó).
const CADUCA_EN_CURSO_MIN = 120

export async function cambiosPendientes() {
  if (!(await pilotoActivo('cartela', 'cambios'))) return { pausado: true, cambios: [] }
  const limite = new Date(Date.now() - CADUCA_EN_CURSO_MIN * 60_000).toISOString()
  const { data } = await sb.from('cartela_peticiones').select('id, local_id, texto, adjuntos, estado, created_at, actualizada_at')
    .or(`estado.eq.recibida,and(estado.eq.en_curso,actualizada_at.lt.${limite})`).order('created_at').limit(20)
  const pets = data || []
  if (!pets.length) return { pausado: false, cambios: [] }
  const { data: locales } = await sb.from('cartela_locales').select('id, slug, nombre, plan, url_carta, proyecto_id, prueba, estado')
    .in('id', Array.from(new Set(pets.map(p => p.local_id))))
  const porId = new Map((locales || []).map(l => [l.id, l]))
  const urls = await firmarAdjuntos(pets.flatMap(p => p.adjuntos as string[]))
  return {
    pausado: false,
    cambios: pets.flatMap(p => {
      const l = porId.get(p.local_id)
      if (!l || l.estado !== 'activo') return []
      return [{
        peticion_id: p.id, texto: p.texto, recibida_en: p.created_at, reintento: p.estado === 'en_curso',
        fotos: (p.adjuntos as string[]).map(r => ({ nombre: r.split('/').pop(), url: urls.get(r) || null })).filter(f => f.url),
        local: { id: l.id, slug: l.slug, nombre: l.nombre, plan: l.plan, url_carta: l.url_carta, proyecto_id: l.proyecto_id, prueba: l.prueba },
      }]
    }),
  }
}

type Cierre = { ok: true } | { error: string; status: number }

async function cargar(id: number) {
  const { data: p } = await sb.from('cartela_peticiones').select('id, local_id, texto, estado').eq('id', id).maybeSingle()
  if (!p) return null
  const { data: l } = await sb.from('cartela_locales').select('id, nombre, proyecto_id, prueba').eq('id', p.local_id).maybeSingle()
  return l ? { p, l } : null
}

export async function cambioEmpezado(id: number): Promise<Cierre> {
  const { data } = await sb.from('cartela_peticiones').update({ estado: 'en_curso', actualizada_at: new Date().toISOString() })
    .eq('id', id).in('estado', ['recibida', 'en_curso']).select('id').maybeSingle()
  return data ? { ok: true } : { error: 'no_pendiente', status: 409 }
}

export async function cambioHecho(id: number, nota: string): Promise<Cierre & { email?: string }> {
  const d = await cargar(id)
  if (!d) return { error: 'no_existe', status: 404 }
  if (!['recibida', 'en_curso'].includes(d.p.estado)) return { error: 'no_pendiente', status: 409 }
  await sb.from('cartela_peticiones').update({ estado: 'publicada', nota: nota.slice(0, 500), actualizada_at: new Date().toISOString() }).eq('id', id)
  // Email al cliente en su hilo («Ya está cambiado»). Sin proyecto (local de prueba) o sin plantilla, solo el push.
  // Sale solo: encender «Cambios» en el piloto es el permiso; la pausa general lo deja como borrador.
  let email = 'sin proyecto'
  if (d.l.proyecto_id) {
    const r = await prepararEmailProyecto(d.l.proyecto_id, 'cambio.publicado', { vars: { nota } }, 'agente-cartela', { auto: true })
    email = 'enviado' in r ? 'enviado' : 'borrador' in r ? 'borrador' : (r.error || r.omitido || 'no')
    await sb.from('eventos').insert({ proyecto_id: d.l.proyecto_id, tipo: 'cambio.publicado', fuente: 'agente-cartela', datos: { peticion_id: id, nota: nota.slice(0, 300), email } })
  }
  await notificar({
    titulo: `Cambio publicado · ${d.l.nombre}${d.l.prueba ? ' (prueba)' : ''}`,
    cuerpo: `${nota.slice(0, 120)}${email === 'enviado' ? ' · avisado por email' : email === 'borrador' ? ' · email en borrador' : ''}`,
    url: d.l.proyecto_id ? `/proyectos/${d.l.proyecto_id}` : '/cartela/cambios', etiqueta: `cartela-peticion-${id}`,
  }).catch(e => console.error('cambio hecho push', e?.message))
  return { ok: true, email }
}

export async function cambioEscalado(id: number, motivo: string): Promise<Cierre> {
  const d = await cargar(id)
  if (!d) return { error: 'no_existe', status: 404 }
  if (!['recibida', 'en_curso'].includes(d.p.estado)) return { error: 'no_pendiente', status: 409 }
  await sb.from('cartela_peticiones').update({ estado: 'escalada', nota: motivo.slice(0, 500), actualizada_at: new Date().toISOString() }).eq('id', id)
  if (d.l.proyecto_id) await sb.from('eventos').insert({ proyecto_id: d.l.proyecto_id, tipo: 'cambio.escalado', fuente: 'agente-cartela', datos: { peticion_id: id, motivo: motivo.slice(0, 300) } })
  await notificar({ titulo: `Cambio para ti · ${d.l.nombre}${d.l.prueba ? ' (prueba)' : ''}`, cuerpo: `El agente no puede: ${motivo.slice(0, 120)}`, url: '/cartela/cambios', etiqueta: `cartela-peticion-${id}` })
    .catch(e => console.error('cambio escalado push', e?.message))
  return { ok: true }
}
