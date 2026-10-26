import { supabaseServer as sb } from '@/lib/supabase-server'
import { cargarSeguimiento } from '@/lib/seguimiento-datos'
import { estadoDe, ORDEN_ESTADO, type Estado, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { estadoLead, type Lead } from '@/lib/leads'

// Work › Proyectos con los leads dentro (rediseño comercial, fase 1): una franja por marca que recibe
// leads, con sus leads abiertos y sus proyectos, cada uno con una sola línea de estado. Lo usan la página
// (/work) y la insignia del menú (/api/work), para que cuenten lo mismo. Solo lee.
export type LeadWork = Pick<Lead, 'id' | 'marca' | 'estado' | 'nombre' | 'email' | 'empresa' | 'recibido_en' | 'ultimo_contacto'> & { prueba?: boolean; estadoVista: Estado }
export type ProyectoWork = ProyectoSeguimiento & { estadoVista: Estado }
export type FranjaWork = { key: string; nombre: string; leads: LeadWork[]; proyectos: ProyectoWork[]; cerrados: ProyectoWork[]; perdidos: LeadWork[] }

const ABIERTOS = ['nuevo', 'borrador', 'respondido', 'conversacion', 'propuesta']
const porEstado = <T extends { estadoVista: Estado }>(a: T, b: T) => ORDEN_ESTADO[a.estadoVista.k] - ORDEN_ESTADO[b.estadoVista.k]

export async function cargarWork() {
  const hace60 = new Date(Date.now() - 60 * 86400000).toISOString()
  const [seg, { data: leads, error }, { data: cobrados }] = await Promise.all([
    cargarSeguimiento(),
    // Abiertos todos; perdidos y spam, solo los de los últimos 60 días (para el desplegable de cada marca).
    sb.from('leads').select('id, marca, estado, nombre, email, empresa, recibido_en, ultimo_contacto, prueba')
      .or(`estado.in.(${ABIERTOS.join(',')}),and(estado.in.(perdido,spam),recibido_en.gte.${hace60})`)
      .order('recibido_en', { ascending: false }).limit(300),
    sb.from('facturas').select('proyecto_id').eq('pago', 1).eq('estado', 'cobrada'),
  ])
  const pago1 = new Set((cobrados || []).map(c => c.proyecto_id as number))
  const proyectos: ProyectoWork[] = seg.lista.map(p => ({ ...p, estadoVista: estadoDe(p, pago1.has(p.id)) }))
  const conEstado: LeadWork[] = ((leads || []) as Omit<LeadWork, 'estadoVista'>[]).map(l => ({ ...l, estadoVista: estadoLead(l) }))

  // Marcas que reciben leads o tienen proyectos con etapa (Ambushed/BoldMove no: va por su timesheet).
  const franjas: FranjaWork[] = seg.marcas.filter(m => m.key !== 'ab').map(m => ({
    key: m.key as string, nombre: m.nombre as string,
    leads: conEstado.filter(l => l.marca === m.key && ABIERTOS.includes(l.estado)).sort(porEstado),
    proyectos: proyectos.filter(p => p.marca === m.key && p.fase !== 'cerrado').sort(porEstado),
    cerrados: proyectos.filter(p => p.marca === m.key && p.fase === 'cerrado'),
    perdidos: conEstado.filter(l => l.marca === m.key && !ABIERTOS.includes(l.estado)),
  }))
  const pendientes = franjas.reduce((n, f) => n + f.leads.filter(l => l.estadoVista.k === 'tu').length + f.proyectos.filter(p => p.estadoVista.k === 'tu').length, 0)
  return { franjas, pendientes, error: seg.error || error }
}
