// Etapas que se mueven solas con el dinero (rediseño comercial, fase 5; decisión de Joel, 2026-10-26):
// - Pago 1 cobrado y la web todavía en «confirmado» o «material» → «comenzado» y el encargo del agente que
//   toque (lo mismo que hacía el botón «Comenzar»). Si la marca no tiene agente, queda «comenzado» para Joel.
// - Pago 2 cobrado y la web en «entregado» → «cerrado».
// Lo llama el tick (cada 5 min), así da igual si el cobro lo marcó el banco o Joel a mano. Solo webs de
// precio cerrado: los treatments se cobran por su timesheet. Cada cambio se reserva con un update
// condicional (la fase de antes), para que dos ticks a la vez no lo hagan dos veces.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { encargarWeb } from '@/lib/primera-version'
import { notificar } from '@/lib/push'

type Fila = { proyecto_id: number | null; pago: number | null }
type Proyecto = { id: number; nombre: string; cliente: string; marca: string | null; fase: string | null; lead_id: number | null }

export async function avanzarPorCobros() {
  const [{ data: cobradas }, { data: webs }] = await Promise.all([
    sb.from('facturas').select('proyecto_id, pago').eq('estado', 'cobrada').in('pago', [1, 2]).not('proyecto_id', 'is', null),
    sb.from('marcas').select('key').eq('modo', 'cerrado'),
  ])
  const pago = (n: number) => new Set(((cobradas || []) as Fila[]).filter(f => f.pago === n).map(f => f.proyecto_id as number))
  const pago1 = pago(1), pago2 = pago(2)
  const ids = Array.from(new Set(Array.from(pago1).concat(Array.from(pago2))))
  if (!ids.length) return { comenzados: 0, cerrados: 0 }
  const { data: proyectos } = await sb.from('proyectos').select('id, nombre, cliente, marca, fase, lead_id')
    .in('id', ids).in('marca', (webs || []).map(m => m.key)).in('fase', ['confirmado', 'material', 'entregado'])

  let comenzados = 0, cerrados = 0
  for (const p of (proyectos || []) as Proyecto[]) {
    const a = p.fase === 'entregado' ? (pago2.has(p.id) ? 'cerrado' : null) : (pago1.has(p.id) ? 'comenzado' : null)
    if (!a) continue
    const { data: movido } = await sb.from('proyectos').update({ fase: a }).eq('id', p.id).eq('fase', p.fase!).select('id')
    if (!movido?.length) continue
    await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'proyecto.fase', fuente: 'joux-cron', datos: { de: p.fase, a, motivo: a === 'comenzado' ? 'pago 1 cobrado' : 'pago 2 cobrado' } })
    if (a === 'comenzado') {
      const encargo = await encargarWeb(p.id, null, 'joux-cron').catch(e => { console.error('cobro encargo', p.id, e?.message); return { omitido: 'No se pudo crear el encargo' } })
      const omitido = encargo && 'omitido' in encargo ? encargo.omitido : null
      const esperaBrief = !!encargo && 'esperando_brief' in encargo && !!encargo.esperando_brief
      await notificar({
        titulo: `Pago 1 cobrado · ${p.cliente}`,
        cuerpo: esperaBrief ? 'Comenzado. El agente espera tu brief de dirección.' : omitido ? `Comenzado. Sin agente: ${omitido}.` : 'Comenzado: el agente ya está montando la primera versión.',
        url: `/proyectos/${p.id}`, etiqueta: `proyecto-${p.id}`,
      }).catch(e => console.error('cobro push', e?.message))
      comenzados++
    } else {
      await notificar({ titulo: `Pago 2 cobrado · ${p.cliente}`, cuerpo: `${p.nombre} queda cerrado.`, url: `/proyectos/${p.id}`, etiqueta: `proyecto-${p.id}` })
        .catch(e => console.error('cobro push', e?.message))
      cerrados++
    }
  }
  return { comenzados, cerrados }
}
