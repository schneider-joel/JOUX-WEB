import { redirect } from 'next/navigation'

// Enlace antiguo (notificaciones, emails internos, resumen diario): el seguimiento por etapa vive
// ahora en Work › Proyectos (/work), hasta que cada marca tenga su tablero (fase 3).
export default function ProyectosPage() {
  redirect('/work')
}
