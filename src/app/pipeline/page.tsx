import { redirect } from 'next/navigation'

// Enlace antiguo (resumen diario, notificaciones): los leads viven ahora en /leads, con el mismo filtro.
export default function PipelinePage({ searchParams }: { searchParams: { marca?: string } }) {
  redirect(searchParams.marca ? `/leads?marca=${encodeURIComponent(searchParams.marca)}` : '/leads')
}
