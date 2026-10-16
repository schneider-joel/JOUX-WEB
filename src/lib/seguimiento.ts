// Seguimiento de proyectos por fase (/proyectos). Usable en el navegador.
import type { FaseProyecto } from './leads'

// Qué toca en cada fase, para la columna «Ahora».
export const AHORA: Record<FaseProyecto, string> = {
  confirmado: 'Enviar bienvenida y pedir material',
  material: 'Esperando material del cliente',
  en_curso: 'Trabajando en la primera versión',
  revision: 'Esperando comentarios del cliente',
  cambios: 'Aplicar cambios y preparar la siguiente ronda',
  entregado: 'Pendiente del cobro final',
  cerrado: 'Terminado',
}

// A partir de cuántos días en la misma fase se marca como parado (cerrado nunca).
export const DIAS_ALERTA: Record<FaseProyecto, number | null> = {
  confirmado: 3, material: 5, en_curso: 10, revision: 4, cambios: 4, entregado: 30, cerrado: null,
}

export type ProyectoSeguimiento = {
  id: number
  nombre: string
  cliente: string
  marca: string | null
  fase: FaseProyecto | null
  desde: string                 // cuándo entró en la fase actual (o se creó)
  lead_id: number | null
  historial: { fase: FaseProyecto; fecha: string }[]  // cambios de fase, del más antiguo al más reciente
  emails: { plantilla: string; fecha: string; error: string | null }[]  // emails enviados al cliente; error = rebotado, spam…
}

export const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
