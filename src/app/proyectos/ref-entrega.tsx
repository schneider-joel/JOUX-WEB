'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Ref de entrega del proyecto (slug de arkevo-revision o carpeta de Pitchview): con ella, los avisos
// de esos sistemas encuentran el proyecto (POST /api/intake/evento).
export default function RefEntrega({ proyectoId, valor }: { proyectoId: number; valor: string | null }) {
  const router = useRouter()
  const [ref, setRef] = useState(valor || '')
  const [guardando, setGuardando] = useState(false)
  const [nota, setNota] = useState<{ ok: boolean; texto: string } | null>(null)
  const cambiado = ref.trim() !== (valor || '')

  const guardar = async () => {
    setGuardando(true); setNota(null)
    const r = await fetch(`/api/proyectos/${proyectoId}/ref`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(false)
    if (!r?.ok) { setNota({ ok: false, texto: j?.error || 'No se pudo guardar' }); return }
    setNota({ ok: true, texto: j.ref ? 'Enlazado' : 'Sin enlazar' }); router.refresh()
  }

  return (
    <form className="trk__ref" onSubmit={e => { e.preventDefault(); if (cambiado) guardar() }}>
      <div className="field">
        <label className="caps" htmlFor={`ref-${proyectoId}`}>Ref de revisión</label>
        <input id={`ref-${proyectoId}`} value={ref} onChange={e => { setRef(e.target.value); setNota(null) }} placeholder="slug o carpeta" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </div>
      {cambiado && <button type="submit" className="pill pill--sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>}
      {nota && <span className={`nota ${nota.ok ? 'ok' : 'error'}`}>{nota.texto}</span>}
    </form>
  )
}
