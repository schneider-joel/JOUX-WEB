// Leads de todas las marcas (tabla `leads`, ver automatizacion.md). Usable en el navegador.
export const ESTADOS_LEAD = ['nuevo', 'borrador', 'respondido', 'conversacion', 'propuesta', 'ganado', 'perdido', 'spam'] as const
export type EstadoLead = typeof ESTADOS_LEAD[number]
export const ETIQUETA_ESTADO: Record<EstadoLead, string> = {
  nuevo: 'Nuevo', borrador: 'Borrador', respondido: 'Respondido', conversacion: 'Conversación',
  propuesta: 'Propuesta', ganado: 'Ganado', perdido: 'Perdido', spam: 'Spam',
}
export const esEstadoLead = (x: unknown): x is EstadoLead => typeof x === 'string' && (ESTADOS_LEAD as readonly string[]).includes(x)

export type Adjunto = { nombre?: string; url: string; bytes?: number; caduca?: string }
export type Lead = {
  id: number; marca: string; origen: string; id_externo: string | null; estado: EstadoLead
  nombre: string | null; email: string; empresa: string | null; telefono: string | null; pais: string | null
  idioma: 'es' | 'en'; interes: Record<string, unknown>; mensaje: string | null; campos: Record<string, unknown>
  adjuntos: Adjunto[]; consentimiento: boolean; proyecto_id: number | null; recibido_en: string; created_at: string; updated_at: string
  prueba?: boolean  // prueba de Joel como cliente: su proyecto factura sin validez fiscal
  para_empezar?: ParaEmpezar  // lo que ya ha mandado el cliente para empezar (rediseño comercial, fase 3)
  resumen_ia: string | null; categoria_ia: string | null; gmail_hilo: string | null; ultimo_contacto: string | null
}

// Mensajes de un lead (tabla `mensajes`): entrantes de Gmail, borradores y enviados.
export type Mensaje = {
  id: number; direccion: 'entrante' | 'saliente'; estado: string; generado_por: string | null; remitente: string | null; para: string
  asunto: string | null; cuerpo: string; error: string | null; enviado_en: string | null; created_at: string
  auto: boolean  // salió sin aprobación (fase 5)
  plantilla?: string | null
  adjuntos?: { nombre: string; ruta: string; tipo: string; bytes: number; en_linea?: boolean }[]  // fotos y PDF de las respuestas (bucket `leads`)
}
// Fase de seguimiento de un proyecto (proyectos.fase). No toca `status` ni dispara facturas.
// «Comenzado» la marca Joel al ver cobrado el pago 1 y crea el encargo del agente (sustituye a «En curso»).
export const FASES_PROYECTO = ['confirmado', 'material', 'comenzado', 'revision', 'cambios', 'entregado', 'cerrado'] as const
export type FaseProyecto = typeof FASES_PROYECTO[number]
export const ETIQUETA_FASE: Record<FaseProyecto, string> = {
  confirmado: 'Confirmado', material: 'Material', comenzado: 'Comenzado', revision: 'Revisión',
  cambios: 'Cambios', entregado: 'Entregado', cerrado: 'Cerrado',
}
export const esFaseProyecto = (x: unknown): x is FaseProyecto => typeof x === 'string' && (FASES_PROYECTO as readonly string[]).includes(x)

export type Evento = { id: number; tipo: string; fuente: string; datos: Record<string, unknown>; created_at: string }

// «hace 3 h», «hace 2 d»… y si es de hace más de una semana, la fecha.
export const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`
  if (min < 60 * 24 * 7) return `hace ${Math.round(min / 1440)} d`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

// ---------- «Para empezar» (rediseño comercial, fase 3) ----------
// Lo que el cliente tiene que mandar antes de ganar el lead, por marca. La IA marca lo que ya ha dado al leer
// el formulario y cada respuesta; Joel puede marcar o desmarcar a mano, y lo suyo manda sobre lo de la IA.
// Con todo marcado, el lead está en «Información recibida» y toca «Marcar ganado».
// Los datos fiscales que la IA encuentra en el hilo van en `fiscales.datos`: con ellos, «Marcar ganado» sale relleno.
export type DatosFiscalesLeidos = { razon_social: string; nif: string; direccion: string; pais: 'ES' | 'UE' | 'EXT' | '' }
export type ParaEmpezar = Record<string, { ok: boolean; por: 'ia' | 'joel'; datos?: DatosFiscalesLeidos }>
export type ItemParaEmpezar = { clave: string; texto: string; corto: string }
const FISCALES: ItemParaEmpezar = { clave: 'fiscales', texto: 'Datos fiscales: razón social, NIF y dirección', corto: 'datos fiscales' }
export const PARA_EMPEZAR: Record<string, ItemParaEmpezar[]> = {
  cartela: [
    { clave: 'carta', texto: 'La carta: web, Instagram o fotos de la carta', corto: 'la carta' },
    { clave: 'platos', texto: 'Cuántos platos y bebidas tiene (para el plan)', corto: 'nº de platos' },
    FISCALES,
  ],
  arkevo: [
    { clave: 'diseno', texto: 'Diseño de la colección o plan elegido', corto: 'diseño' },
    { clave: 'obras', texto: 'Fotos y textos de las obras', corto: 'obras' },
    FISCALES,
  ],
  custom: [
    { clave: 'alcance', texto: 'Qué web necesita y para cuándo', corto: 'alcance' },
    { clave: 'contenido', texto: 'Contenido y referencias', corto: 'contenido' },
    FISCALES,
  ],
  pitchlab: [
    { clave: 'brief', texto: 'Brief y referencias del proyecto', corto: 'brief' },
    { clave: 'plazo', texto: 'Fecha de entrega o de presentación', corto: 'fecha' },
    FISCALES,
  ],
}
export const faltanParaEmpezar = (marca: string, pe: ParaEmpezar | null | undefined) => (PARA_EMPEZAR[marca] || []).filter(i => !pe?.[i.clave]?.ok)
export const infoCompleta = (marca: string, pe: ParaEmpezar | null | undefined) => !!PARA_EMPEZAR[marca] && faltanParaEmpezar(marca, pe).length === 0

// ---------- Vista simple de Work (rediseño comercial, fase 1) ----------
// Los estados abiertos del lead en 3 etapas, y su línea de estado (misma regla de color que los proyectos).
// «Información recibida» no es un estado de la base: sale de «Para empezar» (así el tick, que pasa el lead a
// «conversacion» con cada respuesta, no la pisa).
export const ETAPAS_LEAD_VISTA = ['Nuevo', 'Respondido', 'Información recibida'] as const
type LeadVista = Pick<Lead, 'marca' | 'estado' | 'recibido_en' | 'ultimo_contacto' | 'para_empezar'>
export const etapaLead = (l: Pick<LeadVista, 'marca' | 'estado' | 'para_empezar'>) =>
  infoCompleta(l.marca, l.para_empezar) && !['nuevo', 'borrador'].includes(l.estado) ? 2 : ['respondido', 'conversacion', 'propuesta'].includes(l.estado) ? 1 : 0
const DIAS_LEAD_PARADO = 7
export function estadoLead(l: LeadVista): { k: 'tu' | 'espera' | 'parado' | 'ok'; texto: string } {
  const desde = l.ultimo_contacto || l.recibido_en
  const d = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86400000))
  if (l.estado === 'ganado') return { k: 'ok', texto: 'Ganado' }
  if (l.estado === 'perdido' || l.estado === 'spam') return { k: 'ok', texto: ETIQUETA_ESTADO[l.estado] }
  if (l.estado === 'nuevo') return { k: 'tu', texto: 'Sin responder' }
  if (l.estado === 'borrador') return { k: 'tu', texto: 'Respuesta lista: revísala' }
  if (infoCompleta(l.marca, l.para_empezar)) return { k: 'tu', texto: 'Tiene todo: marca ganado' }
  if (l.estado === 'conversacion') return { k: 'tu', texto: 'Ha respondido: contéstale' }
  const faltan = faltanParaEmpezar(l.marca, l.para_empezar).map(i => i.corto)
  const texto = `${faltan.length ? `Falta ${faltan.join(', ')}` : l.estado === 'propuesta' ? 'Propuesta enviada' : 'Esperando al cliente'}${d > 0 ? ` · ${d} d` : ''}`
  return { k: d >= DIAS_LEAD_PARADO ? 'parado' : 'espera', texto }
}
