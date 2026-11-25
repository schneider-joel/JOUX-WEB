'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// El dashboard se pone al día solo: al volver a la pestaña y cada minuto mientras está abierta. router.refresh()
// pide los datos de nuevo y React cambia solo lo que ha cambiado (sin recargar la página ni perder el scroll).
// `rapido`: justo después de aceptar, la factura del pago 1 tarda unos segundos (Drive, BCE): cada 4 s hasta que llega.
export default function Refrescar({ rapido = false }: { rapido?: boolean }) {
  const router = useRouter()
  useEffect(() => {
    const volver = () => { if (document.visibilityState === 'visible') router.refresh() }
    const cada = setInterval(volver, rapido ? 4_000 : 60_000)
    document.addEventListener('visibilitychange', volver)
    return () => { clearInterval(cada); document.removeEventListener('visibilitychange', volver) }
  }, [router, rapido])
  return null
}
