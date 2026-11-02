'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fechaHora } from '@/lib/leads'
import type { EstadoPeticion, Peticion } from '@/lib/cartela-cambios'

type Fila = Peticion & { fotos: string[] }

const NOMBRE: Record<EstadoPeticion, string> = { recibida: 'Recibida', en_curso: 'En curso', publicada: 'Publicada', escalada: 'Escalada', cancelada: 'Cancelada por el local' }
const CERRADA = (e: EstadoPeticion) => e === 'publicada' || e === 'cancelada'

// Peticiones de un local: abiertas primero. «Publicada» pide la nota que verá el cliente.
export function Peticiones({ lista }: { lista: Fila[] }) {
  const orden = [...lista].sort((a, b) => Number(CERRADA(a.estado)) - Number(CERRADA(b.estado)))
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
        {p.parar && <span className="nota error">El local pide que lo pares (si ya estaba hecho, déjalo como estaba)</span>}
        <span className="fila__t" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{p.plato_nombre ? <b>{p.plato_nombre} · </b> : null}{p.texto}</span>
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
          {p.estado !== 'en_curso' && !CERRADA(p.estado) && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('en_curso')}><span>En curso</span></button>}
          {!CERRADA(p.estado) && <button type="button" className="chip" disabled={ocupado} onClick={() => setNota(p.nota || '')}><span>Publicada</span></button>}
          {p.estado !== 'escalada' && !CERRADA(p.estado) && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('escalada')}><span>Escalar</span></button>}
          {p.estado === 'publicada' && <button type="button" className="chip" disabled={ocupado} onClick={() => guardar('en_curso')}><span>Reabrir</span></button>}
        </span>
      )}
    </div>
  )
}

// Cierra todos los móviles con acceso a los cambios del local y renueva su enlace de entrega.
export function CerrarAccesos({ localId, activos }: { localId: number; activos: number }) {
  const router = useRouter()
  const [paso, setPaso] = useState<'nada' | 'seguro' | 'ocupado'>('nada')
  const [error, setError] = useState('')
  const cerrar = async () => {
    setPaso('ocupado'); setError('')
    const r = await fetch(`/api/cartela/locales/${localId}/accesos`, { method: 'DELETE' }).catch(() => null)
    if (!r?.ok) { setError('No se pudo cerrar'); setPaso('seguro'); return }
    setPaso('nada'); router.refresh()
  }
  return (
    <>
      {' · '}{activos ? `${activos} ${activos === 1 ? 'móvil' : 'móviles'} con acceso` : 'nadie con acceso'}
      {activos > 0 && paso === 'nada' && <> · <button type="button" className="chip" onClick={() => setPaso('seguro')}><span>Cerrar accesos</span></button></>}
      {paso !== 'nada' && <> · <button type="button" className="chip" disabled={paso === 'ocupado'} onClick={cerrar}><span>Sí, cerrar todos y renovar su enlace</span></button>
        {' '}<button type="button" className="chip" onClick={() => setPaso('nada')}><span>No</span></button></>}
      {error && <span className="error"> {error}</span>}
    </>
  )
}
