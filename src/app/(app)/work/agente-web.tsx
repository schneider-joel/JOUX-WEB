'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NOMBRE_ENCARGO, faltaBrief, type ProyectoSeguimiento } from '@/lib/seguimiento'

const hora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

// Encargo al agente (diseño, custom o treatment): encargada → montándose → lista (vista previa solo para
// Joel) o «no se pudo montar» con «Reintentar». Pasada 2+ = se vuelve a montar con material nuevo.
// `detalle` = las notas del agente y el material copiado de Drive.
export default function AgenteWeb({ p, detalle = false }: { p: ProyectoSeguimiento; detalle?: boolean }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState('')
  const a = p.agente

  const encargar = async () => {
    setEnviando(true); setFallo('')
    const r = await fetch(`/api/proyectos/${p.id}/encargo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setFallo(j?.error || 'No se pudo encargar'); return }
    router.refresh()
  }
  const boton = (texto: string) => (
    <button type="button" className="copy caps trk__recordar aviso" disabled={enviando} onClick={encargar}>{enviando ? 'Encargando…' : texto}</button>
  )

  if (detalle) {
    const m = p.material
    if (!(a?.estado === 'lista' && a.notas.length) && !m) return null
    return (
      <>
        {a?.estado === 'lista' && a.notas.length > 0 && (
          <ol>{a.notas.map((n, i) => <li key={i}><span className="caps dim">Agente</span> {n}</li>)}</ol>
        )}
        {m && (
          <ol>
            <li><span className="caps dim">Material</span> {m.copiados} copiado{m.copiados === 1 ? '' : 's'} para el agente{m.pendientes > 0 && <> · {m.pendientes} por copiar</>}</li>
            {m.errores.map(e => <li key={e.ruta} className="aviso"><span className="caps dim">No copiado</span> {e.ruta} · {e.error}</li>)}
          </ol>
        )}
      </>
    )
  }

  if (!a) return p.encargo_tipo && p.fase === 'comenzado' && !(p.encargo_tipo === 'custom' && faltaBrief(p.brief))
    ? boton(`Encargar ${NOMBRE_ENCARGO[p.encargo_tipo]} al agente →`) : null
  const que = NOMBRE_ENCARGO[a.tipo]
  const pasada = a.pasada > 1 ? ` · pasada ${a.pasada}` : ''
  const lista = `${que.charAt(0).toUpperCase()}${que.slice(1)} ${a.tipo === 'treatment' ? 'listo' : 'lista'}`
  return (
    <>
      {a.estado === 'encargada' && <span className="caps dim trk__agente">Agente · {que} encargada{a.pasada > 1 ? ` otra vez (${a.tipo === 'carta' ? 'correcciones' : 'material nuevo'}, pasada ${a.pasada})` : ''} {hora(a.fecha)}</span>}
      {a.estado === 'montandose' && <span className="caps dim trk__agente">Agente · montando {que}{pasada}</span>}
      {a.estado !== 'lista' && a.anterior && <a href={a.anterior} target="_blank" rel="noreferrer" className="copy caps trk__recordar">Pasada anterior ↗</a>}
      {a.estado === 'lista' && (a.url
        ? <a href={a.url} target="_blank" rel="noreferrer" className="copy caps trk__recordar ok">{lista}{a.diseno ? ` · ${a.diseno}` : ''}{pasada} ↗</a>
        : <span className="caps trk__agente ok">{lista}{pasada}</span>)}
      {a.estado === 'error' && (
        <>
          <span className="nota aviso trk__agente">No se pudo montar: {a.motivo}</span>
          {boton('Reintentar →')}
        </>
      )}
      {fallo && <span className="nota error">{fallo}</span>}
    </>
  )
}
