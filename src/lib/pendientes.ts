import { supabaseServer as sb } from '@/lib/supabase-server'
import { cargarSeguimiento } from '@/lib/seguimiento-datos'
import { antesDeComenzar, diasDesde, estaParado, queToca } from '@/lib/seguimiento'
import { FASES_PROYECTO, ETIQUETA_FASE, type FaseProyecto } from '@/lib/leads'

// Lo que pide acción y lo que viene (rediseño, fase 4): una sola función para Hoy y la insignia del
// menú, para que digan lo mismo. Solo lee. El impuesto del trimestre lo añade el hub en el navegador
// (su cálculo, proximoPago, vive en impuestos-tab). El resumen diario (lib/resumen.ts) aún va por su lado.

export type Pendiente = { clave: string; texto: string; sub: string; href: string; urgencia: number }
export type Fecha = { clave: string; fecha: string; texto: string; sub: string; href?: string }
export type Hoy = {
  pendientes: Pendiente[]
  etapas: { fase: FaseProyecto; etiqueta: string; n: number; esperan: number }[]
  esperan: { id: number; cliente: string; nombre: string; toca: string; dias: number }[]
  fechas: Fecha[]
}

const dia = 86400000
const hoyISO = () => new Date().toISOString().slice(0, 10)
const masDias = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * dia).toISOString()
const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))} €`
const QUE_LEAD: Record<string, string> = { nuevo: 'sin responder', borrador: 'borrador listo', conversacion: 'ha respondido' }

export async function cargarHoy(): Promise<Hoy> {
  const hoy = hoyISO()
  const [seg, { data: leads }, { data: marcas }, { data: facturas }, { data: rondas }, { data: cobrados }] = await Promise.all([
    cargarSeguimiento(),
    sb.from('leads').select('id, nombre, email, empresa, marca, estado, recibido_en, ultimo_contacto').in('estado', ['nuevo', 'borrador', 'conversacion']).order('recibido_en'),
    sb.from('marcas').select('key, nombre'),
    sb.from('facturas').select('id, numero, cliente, importe, fecha, fecha_vencimiento, estado, fiscal, proyecto_id, pago').eq('estado', 'pendiente'),
    sb.from('revisiones').select('id, proyecto_id, ronda, estado, comentarios, abierta_en, comentada_en, recordatorios').in('estado', ['abierta', 'comentada']),
    sb.from('facturas').select('proyecto_id').eq('pago', 1).eq('estado', 'cobrada'),
  ])
  const nombreMarca = new Map((marcas || []).map(m => [m.key, m.nombre as string]))
  const pendientes: Pendiente[] = []

  // Facturas vencidas: lo más urgente (más días, más arriba).
  const fiscales = (facturas || []).filter(f => f.fiscal !== false)
  for (const f of fiscales) {
    const vence = f.fecha_vencimiento || f.fecha
    if (vence >= hoy) continue
    const d = diasDesde(vence)
    pendientes.push({ clave: `f${f.id}`, texto: `Factura vencida hace ${d === 1 ? '1 día' : `${d} días`}`, sub: `${f.cliente} · ${f.numero || 'sin número'} · ${eur(Number(f.importe))}`, href: '/finanzas/facturas', urgencia: 300 + d })
  }

  // Proyectos: lo mismo que enseñan Work y la ficha. Pago 1 cobrado sin «Comenzar», aparte.
  const proyectos = seg.lista.filter(p => p.fase !== 'cerrado')
  const pago1Cobrado = new Set((cobrados || []).map(c => c.proyecto_id as number))
  for (const p of proyectos) {
    const parado = estaParado(p)
    if (antesDeComenzar(p) && pago1Cobrado.has(p.id) && !p.material_completo) {
      pendientes.push({ clave: `c${p.id}`, texto: `Pago 1 cobrado: puedes comenzar`, sub: `${p.cliente} · ${nombreMarca.get(p.marca || '') || p.marca}`, href: `/proyectos/${p.id}`, urgencia: 200 + diasDesde(p.desde) })
      continue
    }
    const toca = queToca(p, parado)
    if (!toca || toca === 'Ponle su etapa') continue
    pendientes.push({ clave: `p${p.id}`, texto: toca, sub: `${p.cliente} · ${nombreMarca.get(p.marca || '') || p.marca}`, href: `/proyectos/${p.id}`, urgencia: (p.borradores.length || p.agente ? 150 : 100) + diasDesde(p.desde) })
  }

  // Revisiones que el cliente ya ha comentado: toca aplicar los cambios.
  const deProyecto = new Map(seg.lista.map(p => [p.id, p]))
  for (const r of (rondas || []).filter(r => r.estado === 'comentada')) {
    const p = deProyecto.get(r.proyecto_id)
    pendientes.push({ clave: `v${r.id}`, texto: `Aplicar ${r.comentarios} comentario${r.comentarios === 1 ? '' : 's'} de ${r.ronda}`, sub: p ? `${p.cliente} · ${nombreMarca.get(p.marca || '') || p.marca}` : `Proyecto ${r.proyecto_id}`, href: `/proyectos/${r.proyecto_id}`, urgencia: 160 + diasDesde(r.comentada_en || r.abierta_en) })
  }

  // Leads que esperan a Joel (los mismos que cuenta el menú).
  for (const l of leads || []) {
    const desde = l.estado === 'conversacion' && l.ultimo_contacto ? l.ultimo_contacto : l.recibido_en
    pendientes.push({ clave: `l${l.id}`, texto: `Responder a ${l.empresa || l.nombre || l.email}`, sub: `Lead de ${nombreMarca.get(l.marca) || l.marca} · ${QUE_LEAD[l.estado] || l.estado}`, href: `/leads/${l.id}`, urgencia: 120 + diasDesde(desde) })
  }
  pendientes.sort((a, b) => b.urgencia - a.urgencia)

  // Proyectos por etapa y los tres que más esperan.
  const etapas = FASES_PROYECTO.filter(f => f !== 'cerrado').map(f => {
    const de = proyectos.filter(p => p.fase === f)
    return { fase: f, etiqueta: ETIQUETA_FASE[f], n: de.length, esperan: de.filter(p => queToca(p, estaParado(p))).length }
  })
  const esperan = proyectos.map(p => ({ p, toca: queToca(p, estaParado(p)) })).filter((x): x is { p: typeof x.p; toca: string } => !!x.toca && !!x.p.fase)
    .sort((a, b) => diasDesde(b.p.desde) - diasDesde(a.p.desde)).slice(0, 3)
    .map(({ p, toca }) => ({ id: p.id, cliente: p.cliente, nombre: p.nombre, toca, dias: diasDesde(p.desde) }))

  // Próximas fechas (3 semanas): vencimientos de facturas y recordatorios de las revisiones sin comentarios.
  const hasta = new Date(Date.now() + 21 * dia).toISOString().slice(0, 10)
  const fechas: Fecha[] = []
  for (const f of fiscales) {
    const vence = f.fecha_vencimiento || f.fecha
    if (vence >= hoy && vence <= hasta) fechas.push({ clave: `f${f.id}`, fecha: vence, texto: `Vence ${f.numero || 'una factura'}`, sub: `${f.cliente} · ${eur(Number(f.importe))}`, href: '/finanzas/facturas' })
  }
  for (const r of rondas || []) {
    if (r.estado !== 'abierta' || r.comentarios > 0 || r.recordatorios >= 2) continue
    const cuando = masDias(r.abierta_en, 3 * (r.recordatorios + 1)).slice(0, 10)
    const p = deProyecto.get(r.proyecto_id)
    if (cuando <= hasta) fechas.push({ clave: `r${r.id}`, fecha: cuando < hoy ? hoy : cuando, texto: `Recordatorio de ${r.ronda}`, sub: p ? `${p.cliente} · si no comenta` : 'si no comenta', href: p ? `/proyectos/${p.id}` : undefined })
  }
  fechas.sort((a, b) => a.fecha.localeCompare(b.fecha))

  return { pendientes, etapas, esperan, fechas }
}
