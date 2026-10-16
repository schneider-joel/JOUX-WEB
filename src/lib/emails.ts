// Emails a los clientes de las webs (tabla `plantillas`). Usable en el navegador.
import type { FaseProyecto } from './leads'

// Email que se propone al mover una web a cada fase, y recordatorio cuando se queda parada.
export const EMAIL_AL_ENTRAR: Partial<Record<FaseProyecto, string>> = {
  material: 'proyecto.bienvenida', revision: 'revision.lista', entregado: 'entrega.final',
}
export const EMAIL_RECORDATORIO: Partial<Record<FaseProyecto, string>> = {
  material: 'material.recordatorio', revision: 'revision.recordatorio',
}
export const NOMBRE_EMAIL: Record<string, string> = {
  'proyecto.bienvenida': 'Bienvenida y material', 'material.recordatorio': 'Recordatorio de material',
  'revision.lista': 'Revisión lista', 'revision.recordatorio': 'Recordatorio de revisión', 'entrega.final': 'Entrega final',
}
// Qué enlace pide cada email ({{url}}).
export const QUE_ENLACE: Record<string, string> = {
  'proyecto.bienvenida': 'Carpeta para el material', 'material.recordatorio': 'Carpeta para el material',
  'revision.lista': 'Enlace de la ronda', 'revision.recordatorio': 'Enlace de la ronda', 'entrega.final': 'Web publicada',
}

// Sustituye {{variable}}; las que no tienen valor se dejan tal cual para que se vean antes de enviar.
export const rellenar = (texto: string, vars: Record<string, string | number | null | undefined>) =>
  texto.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] != null && vars[k] !== '' ? String(vars[k]) : m)

export const pendientes = (texto: string) => Array.from(new Set(texto.match(/\{\{\w+\}\}/g) || []))
