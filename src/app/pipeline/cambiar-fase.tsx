'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FASES_PROYECTO, ETIQUETA_FASE, type FaseProyecto } from '@/lib/leads'

// Fase de seguimiento a mano desde Pipeline: se guarda al elegirla y la página se recarga.
export default function CambiarFase({ id, fase }: { id: number; fase: FaseProyecto }) {
  const router = useRouter()
  const [valor, setValor] = useState(fase)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(false)

  const cambiar = async (nueva: FaseProyecto) => {
    const previa = valor
    setValor(nueva); setGuardando(true); setError(false)
    const r = await fetch(`/api/proyectos/${id}/fase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fase: nueva }) }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { setValor(previa); setError(true); return }
    router.refresh()
  }

  return (
    <label className="sel caps" style={{ opacity: guardando ? .6 : 1, alignSelf: 'center', flex: 'none' }} title={error ? 'No se pudo guardar' : undefined}>
      <span className="sr">Fase</span>
      <select value={valor} disabled={guardando} onChange={e => cambiar(e.target.value as FaseProyecto)} aria-label="Fase del proyecto" className={error ? 'aviso' : undefined}>
        {FASES_PROYECTO.map(f => <option key={f} value={f}>{ETIQUETA_FASE[f]}</option>)}
      </select>
      <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </label>
  )
}
