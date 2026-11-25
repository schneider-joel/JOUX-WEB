'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Pendiente } from '@/lib/portal'

export type DatosPortal = {
  enlace: string | null                 // presupuesto.<dominio>/<token>; null = sin presupuesto aceptado
  url_revision: string | null; url_live: string | null; dominio: string | null; dominio_estado: 'pendiente' | 'conectado' | null
  pendientes: Pendiente[]
}

// Lo que el cliente ve en su portal y no sale de otro sitio: review mode, web en vivo, dominio y lo que le toca
// mandar (src/lib/portal.ts). Etapa y facturas salen solas de la fase y de lo facturado.
export default function PortalCliente({ proyectoId, d }: { proyectoId: number; d: DatosPortal }) {
  const router = useRouter()
  const [f, setF] = useState({ url_revision: d.url_revision || '', url_live: d.url_live || '', dominio: d.dominio || '', conectado: d.dominio_estado === 'conectado' })
  const [pend, setPend] = useState<Pendiente[]>(d.pendientes)
  const [nuevo, setNuevo] = useState('')
  const [estado, setEstado] = useState<'' | 'guardando' | 'ok' | string>('')
  const [copiado, setCopiado] = useState(false)

  const guardar = async (pendientes = pend) => {
    setEstado('guardando')
    const r = await fetch(`/api/proyectos/${proyectoId}/portal`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url_revision: f.url_revision, url_live: f.url_live, dominio: f.dominio, dominio_estado: f.conectado ? 'conectado' : 'pendiente', pendientes }),
    }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    if (!r?.ok) { setEstado(j?.error || 'No se pudo guardar'); return }
    setEstado('ok'); router.refresh(); setTimeout(() => setEstado(''), 1500)
  }
  // Los pendientes se guardan al momento (marcar, quitar, añadir); los enlaces, con «Guardar».
  const cambiarPend = (lista: Pendiente[]) => { setPend(lista); guardar(lista) }
  const copiar = async () => { if (!d.enlace) return; await navigator.clipboard.writeText(d.enlace).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 1600) }
  const campo = (k: 'url_revision' | 'url_live' | 'dominio', label: string, ph: string) => (
    <div className="field">
      <label className="caps" htmlFor={`po-${k}`}>{label}</label>
      <input id={`po-${k}`} value={f[k]} placeholder={ph} onChange={e => setF({ ...f, [k]: e.target.value })} />
    </div>
  )

  return (
    <div className="block" style={{ gap: 10 }}>
      {d.enlace ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="pill pill--sm" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
          <a className="ghost" href={d.enlace} target="_blank" rel="noopener noreferrer">Abrir como el cliente</a>
        </div>
      ) : <p className="nota dim">Sin presupuesto aceptado: el portal sale del enlace del presupuesto.</p>}
      {campo('url_revision', 'Modo revisión', 'revision-cliente.joelschneider.io')}
      {campo('url_live', 'Web en vivo (al lanzar)', 'cliente.com')}
      {campo('dominio', 'Dominio', 'cliente.com')}
      <label className="nota" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={f.conectado} onChange={e => setF({ ...f, conectado: e.target.checked })} /> Dominio conectado
      </label>
      <button type="button" className="pill pill--sm" style={{ alignSelf: 'flex-start' }} disabled={estado === 'guardando'} onClick={() => guardar()}>{estado === 'guardando' ? 'Guardando…' : estado === 'ok' ? 'Guardado' : 'Guardar'}</button>

      <span className="caps dim" style={{ marginTop: 8 }}>Lo que necesitas del cliente</span>
      {pend.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pend.map((x, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" aria-label="Hecho" checked={x.hecho} onChange={e => cambiarPend(pend.map((y, j) => j === i ? { ...y, hecho: e.target.checked } : y))} />
              <span className="nota" style={{ flex: 1, textDecoration: x.hecho ? 'line-through' : undefined, opacity: x.hecho ? .6 : 1 }}>{x.texto}</span>
              <button type="button" className="copy caps" onClick={() => cambiarPend(pend.filter((_, j) => j !== i))}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); if (nuevo.trim()) { cambiarPend([...pend, { texto: nuevo.trim(), hecho: false }]); setNuevo('') } }}>
        <input aria-label="Nuevo pendiente" value={nuevo} maxLength={300} placeholder="The list of spots, with Vimeo links" onChange={e => setNuevo(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="ghost" disabled={!nuevo.trim()}>Añadir</button>
      </form>
      {estado && !['guardando', 'ok'].includes(estado) && <p className="nota error">{estado}</p>}
      <p className="nota dim">El cliente lo ve en su idioma tal como lo escribes. Etapa y facturas salen solas.</p>
    </div>
  )
}
