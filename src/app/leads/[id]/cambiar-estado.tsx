'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ESTADOS_LEAD, ETIQUETA_ESTADO, type EstadoLead } from '@/lib/leads'

// Cambio de estado a mano: se guarda al elegirlo y la línea de tiempo se recarga.
export default function CambiarEstado({ id, estado }: { id: number; estado: EstadoLead }) {
  const router = useRouter()
  const [valor, setValor] = useState(estado)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(false)

  const cambiar = async (nuevo: EstadoLead) => {
    const previo = valor
    setValor(nuevo); setGuardando(true); setError(false)
    const r = await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: nuevo }) }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { setValor(previo); setError(true); return }
    router.refresh()
  }

  return (
    <div className="header-actions" style={{ alignItems: 'center', gap: 12 }}>
      {error && <span className="nota aviso">No se pudo guardar</span>}
      <label className="sel caps" style={{ opacity: guardando ? .6 : 1 }}>
        <span className="sr">Estado</span>
        <select value={valor} disabled={guardando} onChange={e => cambiar(e.target.value as EstadoLead)} aria-label="Estado del lead">
          {/* «Ganado» solo desde «Marcar ganado»: crea el cliente y el proyecto. */}
          {ESTADOS_LEAD.map(s => <option key={s} value={s} disabled={s === 'ganado' && valor !== 'ganado'}>{ETIQUETA_ESTADO[s]}</option>)}
        </select>
        <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </label>
    </div>
  )
}
