'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcasJoel } from '@/lib/remitentes'

export type Borrador = { id: number; estado: string; remitente: string | null; para: string; asunto: string | null; cuerpo: string; error: string | null; generado_por: string | null }

// Respuesta al lead: el borrador de la IA (o el que falló al enviar), editable. Solo sale al pulsar
// «Enviar», con el alias de la marca, y no se puede mientras quede alguna marca [[Joel: …]].
export default function Respuesta({ leadId, borrador, remitente, conIa, resumen, categoria }: {
  leadId: number; borrador: Borrador | null; remitente: string | null; conIa: boolean; resumen: string | null; categoria: string | null
}) {
  const router = useRouter()
  const [asunto, setAsunto] = useState(borrador?.asunto || '')
  const [cuerpo, setCuerpo] = useState(borrador?.cuerpo || '')
  const [ocupado, setOcupado] = useState<null | 'enviar' | 'regenerar' | 'descartar'>(null)
  const [error, setError] = useState(borrador?.estado === 'error' ? `No se envió: ${borrador.error || 'error'}` : '')
  const [enviado, setEnviado] = useState(false)

  // Al regenerar llega otro borrador: el editor se rellena con él.
  useEffect(() => { setAsunto(borrador?.asunto || ''); setCuerpo(borrador?.cuerpo || '') }, [borrador?.id, borrador?.asunto, borrador?.cuerpo])

  const pendientes = marcasJoel(`${asunto}\n${cuerpo}`)
  const bloqueado = pendientes.length > 0 || asunto.includes('[[Joel:') || cuerpo.includes('[[Joel:')

  const pedir = async (accion: 'enviar' | 'regenerar' | 'descartar') => {
    if (accion === 'regenerar' && borrador && (asunto !== borrador.asunto || cuerpo !== borrador.cuerpo) && !confirm('Se perderán tus cambios en este borrador. ¿Regenerar?')) return
    setOcupado(accion); setError('')
    const r = await (accion === 'regenerar'
      ? fetch(`/api/leads/${leadId}/borrador`, { method: 'POST' })
      : accion === 'enviar'
        ? fetch(`/api/mensajes/${borrador!.id}/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asunto, cuerpo }) })
        : fetch(`/api/mensajes/${borrador!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'descartado' }) })
    ).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo completar'); return }
    if (accion === 'enviar') setEnviado(true)
    router.refresh()
  }

  const cabecera = (
    <p className="label caps"><span>Respuesta</span><i className="rule" />{remitente && <span className="label__m">{remitente}</span>}</p>
  )
  const resumenIa = (resumen || categoria) && (
    <p className="nota">{categoria && <span className="caps">{categoria}</span>}{categoria && resumen ? ' · ' : ''}{resumen}</p>
  )

  if (enviado) return <section className="block" aria-label="Respuesta">{cabecera}<p className="nota ok">Enviado desde {remitente}. La respuesta del lead aparecerá aquí cuando llegue.</p></section>

  if (!borrador) return (
    <section className="block" aria-label="Respuesta">
      {cabecera}
      {resumenIa}
      {conIa ? (
        <div className="trk__emailpie" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="pill pill--sm" disabled={!!ocupado} onClick={() => pedir('regenerar')}>{ocupado ? 'Redactando…' : 'Redactar con IA'}</button>
          {error && <span className="nota error">{error}</span>}
        </div>
      ) : <p className="nota">Esta marca no tiene borradores de IA.</p>}
    </section>
  )

  return (
    <section className="block" aria-label="Respuesta">
      {cabecera}
      {resumenIa}
      <div className="trk__email">
        <div className="modal__campos">
          <div className="field">
            <label className="caps" htmlFor="rs-para">Para</label>
            <input id="rs-para" value={borrador.para} disabled />
          </div>
          <div className="field">
            <label className="caps" htmlFor="rs-asunto">Asunto</label>
            <input id="rs-asunto" value={asunto} onChange={e => setAsunto(e.target.value)} />
          </div>
          <div className="field">
            <label className="caps" htmlFor="rs-cuerpo">Texto</label>
            <textarea id="rs-cuerpo" rows={Math.min(22, cuerpo.split('\n').length + 2)} value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
          </div>
          {bloqueado && <p className="nota aviso">Rellena antes de enviar: {pendientes.length ? pendientes.join(' · ') : '[[Joel: …]]'}</p>}
          {error && <p className="nota error">{error}</p>}
          <div className="trk__emailpie">
            <button type="button" className="copy caps" disabled={!!ocupado} onClick={() => pedir('descartar')}>{ocupado === 'descartar' ? 'Descartando…' : 'Descartar'}</button>
            {conIa && <button type="button" className="copy caps" disabled={!!ocupado} onClick={() => pedir('regenerar')}>{ocupado === 'regenerar' ? 'Redactando…' : 'Regenerar'}</button>}
            <button type="button" className="pill pill--sm" disabled={!!ocupado || bloqueado || !asunto.trim() || !cuerpo.trim()} onClick={() => pedir('enviar')}>{ocupado === 'enviar' ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
