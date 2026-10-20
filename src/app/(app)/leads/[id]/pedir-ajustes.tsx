'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Ronda de ajustes de la prueba gratis: Joel revisa (y recorta) lo que pidió el cliente y se lo pasa al
// agente /prueba-gratis. Solo hay una ronda: después ya es la propuesta.
export default function PedirAjustes({ leadId, sugerencia, mensajeId }: { leadId: number; sugerencia: string; mensajeId: number | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [peticion, setPeticion] = useState(sugerencia)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const pedir = async () => {
    setOcupado(true); setError('')
    const r = await fetch(`/api/leads/${leadId}/prueba-ajustes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peticion, mensaje_id: mensajeId }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo pedir'); return }
    setAbierto(false); router.refresh()
  }

  if (!abierto) return <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAbierto(true)}>Pedir ajustes al agente</button>
  return (
    <div className="block" style={{ gap: 8 }}>
      <div className="field">
        <label className="caps" htmlFor="pa-peticion">Qué hay que cambiar</label>
        <textarea id="pa-peticion" rows={6} value={peticion} onChange={e => setPeticion(e.target.value)} placeholder="Una línea por cambio" />
      </div>
      <p className="nota">El agente monta la versión 2 en el mismo enlace y te deja el email para revisarlo. Es la única ronda de ajustes.</p>
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={() => { setAbierto(false); setError('') }}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={ocupado || !peticion.trim()} onClick={pedir}>{ocupado ? 'Pidiendo…' : 'Pedir ajustes'}</button>
      </div>
    </div>
  )
}
