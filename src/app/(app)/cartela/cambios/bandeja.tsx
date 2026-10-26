'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fechaHora } from '@/lib/leads'
import type { EstadoPeticion, Peticion } from '@/lib/cartela-cambios'

type Fila = Peticion & { fotos: string[] }

const NOMBRE: Record<EstadoPeticion, string> = { recibida: 'Recibida', en_curso: 'En curso', publicada: 'Publicada', escalada: 'Escalada' }

// Peticiones de un local: abiertas primero. «Publicada» pide la nota que verá el cliente.
export function Peticiones({ lista }: { lista: Fila[] }) {
  const orden = [...lista].sort((a, b) => Number(a.estado === 'publicada') - Number(b.estado === 'publicada'))
  return <ul className="list">{orden.map(p => <li key={p.id}><FilaPeticion p={p} /></li>)}</ul>
}

function FilaPeticion({ p }: { p: Fila }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [nota, setNota] = useState<string | null>(null)

  const guardar = async (estado: EstadoPeticion, conNota?: string) => {
    setOcupado(true); setError('')
    const r = await fetch(`/api/cartela/peticiones/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, ...(conNota !== undefined ? { nota: conNota } : {}) }),
    }).catch(() => null)
    setOcupado(false)
    if (!r?.ok) { setError((await r?.json().catch(() => ({})))?.error || 'No se pudo guardar'); return }
    setNota(null); router.refresh()
  }

  return (
    <div className="fila" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
      <span className="fila__main" style={{ minWidth: 0 }}>
        <span className="fila__t" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{p.texto}</span>
        <span className="fila__s caps">
          {NOMBRE[p.estado]} · {fechaHora(p.created_at)}{p.actualizada_at && p.estado !== 'recibida' ? ` · movida ${fechaHora(p.actualizada_at)}` : ''}
        </span>
        {p.fotos.map((f, i) => <a key={f} href={f} target="_blank" rel="noopener" className="nota">Foto{p.fotos.length > 1 ? ` ${i + 1}` : ''} ↗</a>)}
        {p.nota && <span className="nota">Nota: {p.nota}</span>}
        {nota !== null && (
          <span style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <input autoFocus value={nota} maxLength={500} placeholder="Lo que cambiaste (lo ve el cliente)" onChange={e => setNota(e.target.value)}
              style={{ flex: '1 1 220px' }} onKeyDown={e => { if (e.key === 'Enter') guardar('publicada', nota) }} />
            <button type="button" className="pill" disabled={ocupado} onClick={() => guardar('publicada', nota)}>Guardar</button>
            <button type="button" className="chip" disabled={ocupado} onClick={() => setNota(null)}><span>Cancelar</span></button>
          </span>
        )}
        {error && <span className="nota error">{error}</span>}
      </span>
      {nota === null && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.estado !== 'en_curso' && p.estado !== 'publicada' && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('en_curso')}><span>En curso</span></button>}
          {p.estado !== 'publicada' && <button type="button" className="chip" disabled={ocupado} onClick={() => setNota(p.nota || '')}><span>Publicada</span></button>}
          {p.estado !== 'escalada' && p.estado !== 'publicada' && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('escalada')}><span>Escalar</span></button>}
          {p.estado === 'publicada' && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('en_curso')}><span>Reabrir</span></button>}
        </span>
      )}
    </div>
  )
}
