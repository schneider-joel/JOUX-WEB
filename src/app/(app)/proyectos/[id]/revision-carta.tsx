'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Carta de Cartela en revisión (2026-10-27): o el cliente pide correcciones (van al agente con «Repetir», pasada
// siguiente) o da el OK y Joel la entrega con «Aprobar y entregar» (pasa a Entregado y la caja ofrece la entrega
// con el QR, el enlace de cambios y la factura del pago 2). El texto viene relleno con lo que la IA sacó de sus correos.
export default function RevisionCarta({ proyectoId, correcciones, url }: { proyectoId: number; correcciones: string[]; url: string | null }) {
  const router = useRouter()
  const [texto, setTexto] = useState(correcciones.join('\n\n'))
  const [entregar, setEntregar] = useState(false)
  const [guardando, setGuardando] = useState<'repetir' | 'entregar' | null>(null)
  const [error, setError] = useState('')

  const repetir = async () => {
    setGuardando('repetir'); setError('')
    const r = await fetch(`/api/proyectos/${proyectoId}/repetir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo encargar'); return }
    router.refresh()
  }
  const aprobar = async () => {
    setGuardando('entregar'); setError('')
    const r = await fetch(`/api/proyectos/${proyectoId}/fase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fase: 'entregado' }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo guardar'); return }
    setEntregar(false); router.refresh()
  }

  return (
    <div className="trk__brief" aria-label="Revisión de la carta">
      <div className="field">
        <label className="caps" htmlFor={`rc-${proyectoId}`}>Correcciones para el agente</label>
        <textarea id={`rc-${proyectoId}`} rows={5} value={texto} onChange={e => setTexto(e.target.value)} maxLength={4000}
          placeholder="Pega aquí lo que pide el cliente (dirección, horario, precios, bebidas…). Las fotos de sus correos las ve el agente." />
        {correcciones.length > 0 && <p className="nota field__nota">Relleno con lo que pidió en {correcciones.length === 1 ? 'su respuesta' : `sus ${correcciones.length} respuestas`}. Revísalo antes de repetir.</p>}
      </div>
      {error && <p className="nota error">{error}</p>}
      {entregar ? (
        <div className="trk__mover fx__mover">
          <span>La carta pasa a <b>Entregada</b> y te preparo la entrega: carta, QR, enlace de cambios y factura del 50 % final. No sale nada hasta que pulses «Emitir y enviar».</span>
          <button type="button" className="copy caps" onClick={() => setEntregar(false)}>Cancelar</button>
          <button type="button" className="pill pill--sm" disabled={!!guardando} onClick={aprobar}>{guardando === 'entregar' ? 'Guardando…' : 'Confirmar'}</button>
        </div>
      ) : (
        <div className="fx__btns">
          <button type="button" className="pill pill--sm" disabled={!texto.trim() || !!guardando} onClick={repetir}>{guardando === 'repetir' ? 'Encargando…' : 'Repetir con estas correcciones'}</button>
          <button type="button" className="copy caps" disabled={!!guardando} onClick={() => { setError(''); setEntregar(true) }}>Aprobar y entregar</button>
          {url && <a className="copy caps" href={url} target="_blank" rel="noreferrer">Ver la carta ↗</a>}
        </div>
      )}
    </div>
  )
}
