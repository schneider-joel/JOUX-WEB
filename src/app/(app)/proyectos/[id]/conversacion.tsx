'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NOMBRE_EMAIL } from '@/lib/emails'
import { marcasJoel } from '@/lib/remitentes'
import type { DatosFicha, MensajeHilo } from './ficha'

export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]!.toUpperCase()).join('')
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).replace('.', '')

// Panel de la conversación con el cliente (a la derecha; en el móvil, encima). Emails del lead y del
// proyecto en un hilo, con los avisos del sistema entre medias. Nada sale sin pulsar «Enviar»:
// - borradores de una plantilla del proyecto → se revisan en el panel de email de la ficha (el de siempre);
// - respuesta preparada para el lead (IA o la que falló) → se edita aquí y sale por Gmail como en la ficha del lead;
// - texto libre → POST /api/proyectos/<id>/mensaje, por Gmail en el mismo hilo.
export default function Conversacion({ abierta, onCerrar, d, onEmail }: { abierta: boolean; onCerrar: () => void; d: DatosFicha; onEmail: (clave: string, mensaje?: number) => void }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<'todo' | 'msg' | 'aviso'>('todo')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState<null | 'enviar' | 'ia'>(null)
  const [error, setError] = useState('')
  const [nota, setNota] = useState('')
  const hiloRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!abierta) return
    panelRef.current?.focus()
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierta, onCerrar])

  const nombre = d.p.contacto || d.p.cliente
  const puedeEscribir = !!d.lead && !!d.remitente
  const lista = d.hilo.filter(x => filtro === 'todo' || x.tipo === filtro)

  const enviar = async () => {
    if (!texto.trim()) return
    if (!confirm(`¿Enviar este email a ${d.p.email || nombre} desde ${d.remitente}?`)) return
    setOcupado('enviar'); setError('')
    const r = await fetch(`/api/proyectos/${d.p.id}/mensaje`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuerpo: texto }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo enviar'); return }
    setTexto(''); setNota('Enviado'); router.refresh()
  }
  const borradorIa = async () => {
    if (!d.lead) return
    setOcupado('ia'); setError('')
    const r = await fetch(`/api/leads/${d.lead.id}/borrador`, { method: 'POST' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo preparar el borrador'); return }
    setNota('Borrador listo: está en el hilo, revísalo antes de enviarlo'); router.refresh()
  }

  return (
    <>
      <div className={`fx__scrim${abierta ? ' is-on' : ''}`} onClick={onCerrar} aria-hidden="true" />
      <aside ref={panelRef} id="fx-chat" className={`fx__drawer${abierta ? ' is-on' : ''}`} role="dialog" aria-modal="false" aria-labelledby="fx-chat-t" tabIndex={-1} aria-hidden={!abierta}>
        <div className="fx__dh">
          <span className="fx__av" aria-hidden="true">{iniciales(nombre)}</span>
          <div className="fx__tx"><b id="fx-chat-t">{nombre}</b><span>{d.p.email || 'sin email'}{d.remitente ? ` · desde ${d.remitente}` : ''}</span></div>
          <button type="button" className="fx__x" onClick={onCerrar} aria-label="Cerrar conversación">✕</button>
        </div>
        <div className="seg caps fx__seg" role="group" aria-label="Filtrar">
          {(['todo', 'msg', 'aviso'] as const).map(f => <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === 'todo' ? 'Todo' : f === 'msg' ? 'Emails' : 'Avisos'}</button>)}
        </div>
        <div className="fx__thread" ref={hiloRef}>
          {lista.length === 0 && <p className="nota">Aún no hay nada aquí.</p>}
          {lista.map(x => x.tipo === 'aviso'
            ? <div key={x.clave} className="fx__sys">{x.texto} · {fechaHora(x.fecha)}</div>
            : <Mensaje key={x.clave} m={x.m} fecha={x.fecha} nombre={nombre} onEmail={onEmail} />)}
        </div>
        <form className="fx__composer" onSubmit={e => { e.preventDefault(); enviar() }}>
          {puedeEscribir ? (
            <>
              <label className="caps dim" htmlFor="fx-msg">Escribir a {nombre}</label>
              <textarea id="fx-msg" value={texto} onChange={e => { setTexto(e.target.value); setNota('') }} placeholder="Escribe un email o pide un borrador a la IA…" />
              {error && <span className="nota error">{error}</span>}
              {nota && <span className="nota">{nota}</span>}
              <div className="fx__row">
                <button type="button" className="ghost" disabled={!!ocupado} onClick={borradorIa}>{ocupado === 'ia' ? 'Preparando…' : 'Borrador con IA'}</button>
                <button type="submit" className="pill pill--sm" disabled={!!ocupado || !texto.trim()}>{ocupado === 'enviar' ? 'Enviando…' : 'Enviar'}</button>
              </div>
            </>
          ) : <p className="nota">{d.lead ? 'Esta marca no tiene remitente de Gmail.' : 'Este proyecto no viene de un lead: escríbele desde Gmail.'}</p>}
        </form>
      </aside>
    </>
  )
}

// Un email del hilo. Las respuestas preparadas para el lead se editan y se envían aquí mismo.
function Mensaje({ m, fecha, nombre, onEmail }: { m: MensajeHilo; fecha: string; nombre: string; onEmail: (clave: string, mensaje?: number) => void }) {
  const router = useRouter()
  const pendiente = !m.entrante && (m.estado === 'borrador' || m.estado === 'error')
  const [editar, setEditar] = useState(false)
  const [asunto, setAsunto] = useState(m.asunto || '')
  const [cuerpo, setCuerpo] = useState(m.cuerpo)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(m.estado === 'error' ? `No se envió: ${m.error || 'error'}` : '')
  const marcas = marcasJoel(`${asunto}\n${cuerpo}`)

  if (!pendiente) return (
    <div className={`fx__msg ${m.entrante ? 'in' : 'out'}`}>
      <div className="fx__meta"><span>{m.entrante ? nombre : m.plantilla ? NOMBRE_EMAIL[m.plantilla] || 'Email' : 'Tú'}{m.auto ? ' · automático' : ''}</span><span>{fechaHora(fecha)}</span></div>
      {m.asunto && <b>{m.asunto}</b>}
      <p>{m.cuerpo}</p>
    </div>
  )

  // Borrador de una plantilla del proyecto: se revisa en el panel de email de la ficha (rellena el enlace, etc.).
  if (m.deProyecto) return (
    <div className="fx__draft">
      <span className="fx__dm">Borrador · {NOMBRE_EMAIL[m.plantilla || ''] || m.plantilla}</span>
      {m.asunto && <b>{m.asunto}</b>}
      {m.error && <span className="nota error">{m.error}</span>}
      <div className="fx__row"><button type="button" className="pill pill--sm" onClick={() => onEmail(m.plantilla || '', m.id)}>Revisar y enviar</button></div>
    </div>
  )

  const pedir = async (accion: 'enviar' | 'guardar' | 'descartar') => {
    if (accion === 'enviar' && !confirm(`¿Enviar este email a ${m.para || nombre}?`)) return
    setOcupado(true); setError('')
    const r = await fetch(accion === 'enviar' ? `/api/mensajes/${m.id}/enviar` : `/api/mensajes/${m.id}`, {
      method: accion === 'enviar' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accion === 'descartar' ? { estado: 'descartado' } : { asunto, cuerpo }),
    }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo'); return }
    setEditar(false); router.refresh()
  }
  return (
    <div className="fx__draft">
      <span className="fx__dm">Borrador · por aprobar</span>
      {editar ? (
        <>
          <input className="fx__in" value={asunto} onChange={e => setAsunto(e.target.value)} aria-label="Asunto" />
          <textarea className="fx__in" value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={8} aria-label="Texto" />
        </>
      ) : <>{asunto && <b>{asunto}</b>}<p>{cuerpo}</p></>}
      {marcas.length > 0 && <span className="nota aviso">Quedan {marcas.length} marcas [[Joel: …]] por rellenar</span>}
      {error && <span className="nota error">{error}</span>}
      <div className="fx__row">
        <button type="button" className="pill pill--sm" disabled={ocupado || marcas.length > 0} onClick={() => pedir('enviar')}>Enviar</button>
        {editar ? <button type="button" className="ghost" disabled={ocupado} onClick={() => pedir('guardar')}>Guardar</button>
          : <button type="button" className="ghost" onClick={() => setEditar(true)}>Editar</button>}
        <button type="button" className="ghost" disabled={ocupado} onClick={() => confirm('¿Descartar este borrador?') && pedir('descartar')}>Descartar</button>
      </div>
    </div>
  )
}
