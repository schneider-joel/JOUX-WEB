'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// El dashboard se pone al día solo: al volver a la pestaña y cada minuto mientras está abierta. router.refresh()
// pide los datos de nuevo y React cambia solo lo que ha cambiado (sin recargar la página ni perder el scroll).
export default function Refrescar() {
  const router = useRouter()
  useEffect(() => {
    const volver = () => { if (document.visibilityState === 'visible') router.refresh() }
    const cada = setInterval(volver, 60_000)
    document.addEventListener('visibilitychange', volver)
    return () => { clearInterval(cada); document.removeEventListener('visibilitychange', volver) }
  }, [router])
  return null
}
