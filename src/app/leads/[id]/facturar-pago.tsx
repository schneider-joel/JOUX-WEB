'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { desglose } from '@/lib/importes'

const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)

// «Facturar pago 1» de una web de precio cerrado recién ganada: el mismo flujo que la pestaña Webs
// (/api/agencias/facturar → crear_factura_pago), que rechaza clientes sin datos fiscales o de la UE.
export default function FacturarPago1({ proyectoId, precio, pais }: { proyectoId: number; precio: number; pais: string | null }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const base = Math.round(precio / 2 * 100) / 100
  const d = pais === 'ES' ? desglose(base, true) : null

  const facturar = async () => {
    setOcupado(true); setError('')
    const r = await fetch('/api/agencias/facturar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proyecto_id: proyectoId, pago: 1 }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo crear la factura'); return }
    setConfirmando(false); router.refresh()
  }

  if (!confirmando) return <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmando(true)}>Facturar pago 1</button>
  return (
    <div className="block" style={{ gap: 8 }}>
      <dl className="desg">
        {(d ? [['Base', d.base], ['IVA 21 %', d.iva], ['Retención 15 %', -d.ret]] : [['Base', base]]).map(([k, v]) => (
          <div key={k as string}><dt>{k}</dt><dd className="num">{eur(v as number)}</dd></div>
        ))}
        <div className="desg__t"><dt>A cobrar</dt><dd className="num">{eur(d?.total ?? base)}</dd></div>
      </dl>
      <p className="nota">Se crea de verdad como factura pendiente (50 % al empezar). El número lo asigna la base de datos.</p>
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={() => { setConfirmando(false); setError('') }}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={ocupado} onClick={facturar}>{ocupado ? 'Creando…' : 'Crear factura'}</button>
      </div>
    </div>
  )
}
