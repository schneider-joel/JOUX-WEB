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
  adjuntos: Adjunto[]; consentimiento: boolean; recibido_en: string; created_at: string; updated_at: string
}
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
