import { redirect } from 'next/navigation'

// Enlace antiguo (resumen diario, notificaciones): los leads viven ahora en Work › Proyectos, con el mismo filtro.
export default function PipelinePage({ searchParams }: { searchParams: { marca?: string } }) {
  redirect(searchParams.marca ? `/work?marca=${encodeURIComponent(searchParams.marca)}` : '/work')
}
