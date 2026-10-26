import { notFound } from 'next/navigation'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { cargarSeguimiento } from '@/lib/seguimiento-datos'
import { fasesDe, MARCAS_TREATMENT } from '@/lib/seguimiento'
import { esFaseProyecto, type FaseProyecto } from '@/lib/leads'
import { aProyectoAgencia } from '@/lib/marcas'
import { estadoPrueba } from '@/lib/prueba-gratis'
import { remitenteLead } from '@/lib/remitentes'
import { textoEvento } from '@/lib/eventos-texto'
import { enlaceCambios } from '@/lib/cartela-cambios'
import Ficha, { type DatosFicha, type ItemHilo } from './ficha'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la ficha sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Proyecto · JOUX Hub', robots: { index: false, follow: false } }

// Ficha de un proyecto (rediseño comercial, fase 2): etapa, lo que toca, el recorrido y a un lado dinero,
// enlaces y cliente; la conversación en un panel.
// Solo lee; las acciones (etapa, emails, agente, Drive, brief) son las mismas de Work › Proyectos.
export default async function ProyectoPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) notFound()
  const { data: p } = await sb.from('proyectos').select('*').eq('id', id).maybeSingle()
  if (!p) notFound()

  // Mensajes y eventos del proyecto y de su lead (la conversación empieza antes de ganarlo). Todo a la vez.
  const deAmbos = p.lead_id ? `proyecto_id.eq.${id},lead_id.eq.${p.lead_id}` : `proyecto_id.eq.${id}`
  const [seg, { data: marca }, { data: cliente }, { data: facturas }, { data: dias }, { data: lead }, { data: mensajes }, { data: eventos }] = await Promise.all([
    cargarSeguimiento({ id }),
    sb.from('marcas').select('key, nombre, modo').eq('key', p.marca || '').maybeSingle(),
    sb.from('clientes_fiscales').select('*').eq('cliente', p.cliente).maybeSingle(),
    sb.from('facturas').select('id, numero, fecha, importe, estado, pago, fiscal, tipo_factura, proyecto_id').eq('proyecto_id', id).order('fecha'),
    sb.from('dias_trabajados').select('fecha, total_day').eq('proyecto_id', id).order('fecha'),
    p.lead_id ? sb.from('leads').select('id, nombre, email, empresa, marca, idioma, gmail_hilo').eq('id', p.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('mensajes').select('id, direccion, estado, generado_por, remitente, para, asunto, cuerpo, error, enviado_en, created_at, auto, plantilla, proyecto_id, lead_id').or(deAmbos).order('created_at'),
    sb.from('eventos').select('id, tipo, fuente, datos, created_at').or(deAmbos).order('created_at'),
  ])
  const cerrado = marca?.modo === 'cerrado'
  // Igual que en Work › Proyectos: los treatments sin etapa (los de antes) se llevan solo en su timesheet.
  const s = seg.lista.find(x => cerrado || x.fase) || null
  const msgs = mensajes || []
  const evs = (eventos || []) as { id: number; tipo: string; fuente: string | null; datos: Record<string, unknown>; created_at: string }[]

  // Etapas: las de su marca, con la fecha en que entró en cada una (la última vez).
  const fases = fasesDe(p.marca) as FaseProyecto[]
  const fechaFase: Partial<Record<FaseProyecto, string>> = {}
  for (const h of s?.historial || []) fechaFase[h.fase] = h.fecha

  // Dinero. Webs de precio cerrado: dos pagos. Treatments: días del timesheet y sus facturas.
  const fiscales = (facturas || []).filter(f => f.fiscal !== false)
  const agencia = cerrado ? aProyectoAgencia(p, facturas || [], cliente ? [cliente] : []) : null
  const dinero: DatosFicha['dinero'] = agencia
    ? { tipo: 'cerrado', precio: agencia.precio, pagos: agencia.pagos.map((x, i) => ({ n: i + 1, ...x, importe: agencia.precio / 2 })), unica: agencia.unica || null }
    : { tipo: 'dias', dias: (dias || []).length, base: (dias || []).reduce((t, d) => t + Number(d.total_day || 0), 0),
        facturas: fiscales.map(f => ({ id: f.id, numero: f.numero, fecha: f.fecha, importe: Number(f.importe), estado: f.estado })) }

  // Enlaces: los que existen de verdad (prueba gratis, primera versión, rondas de revisión, Drive, web).
  const prueba = lead ? estadoPrueba(evs, msgs) : null
  const enlaces: DatosFicha['enlaces'] = []
  const ultPrueba = prueba?.ajustada || prueba?.lista
  if (ultPrueba?.url) enlaces.push({ titulo: 'Prueba gratis', url: ultPrueba.url, estado: (prueba?.ajustadaEnviada || prueba?.enviada) ? 'Enviada' : 'Sin enviar', tono: (prueba?.ajustadaEnviada || prueba?.enviada) ? 'ok' : null, icono: 'gift' })
  // Cartela: la carta publicada, su QR (bucket privado, enlace de 1 h) y el enlace de cambios del cliente. La vista
  // previa del agente solo mientras se revisa (después ya no existe).
  if (p.marca === 'cartela') {
    const { data: local } = await sb.from('cartela_locales').select('slug, url_carta').eq('proyecto_id', id).maybeSingle()
    if (local?.url_carta) enlaces.push({ titulo: 'Carta', url: local.url_carta, estado: s?.fase === 'entregado' || s?.fase === 'cerrado' ? 'Publicada' : 'Para revisar', tono: null, icono: 'globe' })
    const { data: qr } = local?.slug ? await sb.storage.from('cartela').createSignedUrl(`qr/${local.slug}.png`, 3600, { download: `QR ${local.slug}.png` }) : { data: null }
    if (qr?.signedUrl) enlaces.push({ titulo: 'QR para imprimir', url: qr.signedUrl, estado: 'PNG', tono: null, icono: 'doc' })
    const cambios = await enlaceCambios(id)
    if (cambios) enlaces.push({ titulo: 'Cambios del cliente', url: cambios, estado: 'Su enlace', tono: null, icono: 'chat' })
  }
  if (s?.agente?.estado === 'lista' && s.agente.url && (p.marca !== 'cartela' || s.fase === 'comenzado')) enlaces.push({ titulo: MARCAS_TREATMENT.includes(p.marca || '') ? 'Treatment del agente' : 'Primera versión', url: s.agente.url, estado: s.fase === 'comenzado' ? 'Por revisar' : 'Lista', tono: s.fase === 'comenzado' ? 'aviso' : null, icono: 'pen' })
  const ronda = s?.rondas.length ? s.rondas[s.rondas.length - 1] : null
  if (ronda?.url) enlaces.push({ titulo: `Revisión ${ronda.ronda}`, url: ronda.url, estado: ronda.estado === 'comentada' ? `${ronda.comentarios} comentarios` : ronda.estado === 'abierta' ? 'Esperando al cliente' : 'Cerrada', tono: ronda.estado === 'comentada' ? 'aviso' : null, icono: 'chat' })
  if (p.drive_url) enlaces.push({ titulo: 'Carpeta de Drive', url: p.drive_url, estado: 'Compartida', tono: null, icono: 'folder' })
  if (p.web && /\./.test(p.web) && cerrado) enlaces.push({ titulo: 'Web', url: /^https?:\/\//.test(p.web) ? p.web : `https://${p.web}`, estado: s?.fase === 'entregado' || s?.fase === 'cerrado' ? 'Publicada' : 'Al entregar', tono: null, icono: 'globe' })

  // Conversación: emails (enviados, recibidos, borradores) y avisos del sistema, en orden.
  const AVISOS = new Set(['lead.ganado', 'proyecto.fase', 'factura.emitida', 'web.lista', 'web.error', 'prueba.lista', 'material.completo', 'material.subido', 'datos.fiscales', 'mensaje.rebotado'])
  const hilo: ItemHilo[] = [
    ...msgs.filter(m => ['enviado', 'recibido', 'borrador', 'error'].includes(m.estado)).map(m => ({
      tipo: 'msg' as const, clave: `m${m.id}`, fecha: (m.enviado_en || m.created_at) as string,
      m: { id: m.id, entrante: m.direccion === 'entrante', estado: m.estado, asunto: m.asunto, cuerpo: m.cuerpo, error: m.error, plantilla: m.plantilla, auto: !!m.auto, deProyecto: m.proyecto_id === id && !!m.plantilla, de: m.remitente, para: m.para },
    })),
    ...evs.filter(e => AVISOS.has(e.tipo) || e.tipo.startsWith('revision.')).map(e => ({ tipo: 'aviso' as const, clave: `e${e.id}`, fecha: e.created_at, texto: textoEvento(e) })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const datos: DatosFicha = {
    p: {
      id: p.id, nombre: p.nombre, cliente: p.cliente, marca: p.marca, marcaNombre: marca?.nombre || p.marca || 'Sin marca', cerrado,
      web: p.web, plan: p.plan, status: p.status, prueba: !!p.prueba, fase: esFaseProyecto(p.fase) ? p.fase : null,
      contacto: p.contacto_nombre || lead?.nombre || null, email: p.contacto_email || lead?.email || null, created_at: p.created_at,
    },
    seg: s, fases, fechaFase,
    dinero,
    cliente: cliente ? { identificador: cliente.identificador || null, direccion: cliente.direccion || null, pais: cliente.pais || null } : null,
    lead: lead ? { id: lead.id, nombre: lead.nombre, email: lead.email, empresa: lead.empresa, hilo: !!lead.gmail_hilo } : null,
    remitente: lead ? remitenteLead(lead.marca, lead.idioma) : null,
    enlaces,
    // Webs y treatments que vienen de un lead: la bienvenida (con la factura del pago 1) se envía desde la ficha del lead.
    bienvenidaPendiente: !!lead && (cerrado || MARCAS_TREATMENT.includes(p.marca || '')) && !msgs.some(m => m.plantilla === 'proyecto.bienvenida' && m.estado === 'enviado'),
    hilo,
    historial: evs.slice().reverse().filter(e => !['ia.borrador', 'mensaje.descartado', 'lead.estado'].includes(e.tipo)).slice(0, 40).map(e => ({ clave: e.id, tipo: e.tipo, fecha: e.created_at, texto: textoEvento(e), aviso: ['web.error', 'mensaje.rebotado', 'prueba.error'].includes(e.tipo) })),
  }
  return <Ficha d={datos} />
}
