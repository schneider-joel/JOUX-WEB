import { redirect } from 'next/navigation'

// Finanzas › Patrimonio llega en la fase 5; mientras, la sección abre en Facturas.
export default function FinanzasPage() {
  redirect('/finanzas/facturas')
}
