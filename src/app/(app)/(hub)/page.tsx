import { redirect } from 'next/navigation'
import { rutaDeTab } from '../../rutas'

// Hoy: de momento, el Overview de siempre (la pantalla nueva llega en la fase 4).
// Enlaces antiguos /?tab=…: las notificaciones de cobro (/?tab=facturas) y la vuelta de Enable Banking
// (/?tab=bancos&ok=1 o &error=…) van a su ruta nueva con el resto de parámetros.
export default function HoyPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const tab = typeof searchParams.tab === 'string' ? searchParams.tab : null
  if (tab) {
    const resto = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) if (k !== 'tab' && typeof v === 'string') resto.set(k, v)
    const q = resto.toString()
    redirect(`${rutaDeTab(tab) || '/'}${q ? `?${q}` : ''}`)
  }
  return null
}
