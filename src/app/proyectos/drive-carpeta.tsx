'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Carpeta de Drive del proyecto: enlace si ya está compartida; si no, «Crear carpeta de Drive» (o
// «Reintentar» con el motivo del último fallo). La crea y comparte POST /api/proyectos/[id]/drive.
export default function DriveCarpeta({ proyectoId, url, error }: { proyectoId: number; url: string | null; error: string | null }) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [fallo, setFallo] = useState(error)

  if (url) return <a href={url} target="_blank" rel="noreferrer" className="copy caps">Carpeta de Drive ↗</a>

  const crear = async () => {
    setCreando(true); setFallo(null)
    const r = await fetch(`/api/proyectos/${proyectoId}/drive`, { method: 'POST' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setCreando(false)
    if (!r?.ok) { setFallo(j?.error || 'No se pudo crear la carpeta'); return }
    router.refresh()
  }

  return (
    <span className="trk__drive">
      {fallo && <span className="nota aviso">Drive: {fallo}</span>}
      <button type="button" className="copy caps" disabled={creando} onClick={crear}>
        {creando ? 'Creando carpeta…' : fallo ? 'Reintentar' : 'Crear carpeta de Drive'}
      </button>
    </span>
  )
}
