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
export const FASES_PROYECTO = ['confirmado', 'material', 'en_curso', 'revision', 'cambios', 'entregado', 'cerrado'] as const
export type FaseProyecto = typeof FASES_PROYECTO[number]
export const ETIQUETA_FASE: Record<FaseProyecto, string> = {
  confirmado: 'Confirmado', material: 'Material', en_curso: 'En curso', revision: 'Revisión',
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
