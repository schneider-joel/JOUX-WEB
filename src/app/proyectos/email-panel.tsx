'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NOMBRE_EMAIL, QUE_ENLACE, pendientes } from '@/lib/emails'

type Borrador = { remitente: string; para: string; asunto: string; cuerpo: string }

// Email al cliente de una web: sale de su plantilla ya rellenada, Joel pega el enlace, puede
// retocar el texto y solo se envía al pulsar «Enviar».
export default function EmailPanel({ proyectoId, clave, onCerrar }: { proyectoId: number; clave: string; onCerrar: () => void }) {
  const router = useRouter()
  const [b, setB] = useState<Borrador | null>(null)
  const [url, setUrl] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    fetch(`/api/proyectos/${proyectoId}/email?clave=${clave}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error || 'No se pudo preparar el email'); else setB(j)
    }).catch(() => setError('No se pudo preparar el email'))
  }, [proyectoId, clave])

  // El enlace se mete en {{url}} al vuelo; el resto del texto es editable.
  const conUrl = (s: string) => url.trim() ? s.replace(/\{\{url\}\}/g, url.trim()) : s
  const asunto = b ? conUrl(b.asunto) : '', cuerpo = b ? conUrl(b.cuerpo) : ''
  const faltan = pendientes(asunto + cuerpo)
  const pideUrl = !!b && /\{\{url\}\}/.test(b.asunto + b.cuerpo)

  const enviar = async () => {
    if (!b) return
    setEnviando(true); setError('')
    const r = await fetch(`/api/proyectos/${proyectoId}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, para: b.para, asunto, cuerpo }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo enviar'); return }
    setEnviado(true); router.refresh()
  }

  if (enviado) return (
    <div className="trk__email">
      <p className="nota ok">Email enviado a {b?.para}.</p>
      <div className="trk__emailpie"><button type="button" className="copy caps" onClick={onCerrar}>Cerrar</button></div>
    </div>
  )

  return (
    <div className="trk__email">
      <p className="label caps"><span>Email al cliente · {NOMBRE_EMAIL[clave]}</span><i className="rule" />{b && <span className="label__m">{b.remitente}</span>}</p>
      {!b ? <p className="nota">{error || 'Preparando el email…'}</p> : (
        <div className="modal__campos">
          <div className="modal__par">
            <div className="field">
              <label className="caps" htmlFor={`em-para-${proyectoId}`}>Para</label>
              <input id={`em-para-${proyectoId}`} type="email" value={b.para} onChange={e => setB({ ...b, para: e.target.value })} placeholder="cliente@estudio.es" />
            </div>
            {pideUrl && (
              <div className="field">
                <label className="caps" htmlFor={`em-url-${proyectoId}`}>{QUE_ENLACE[clave]}</label>
                <input id={`em-url-${proyectoId}`} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
              </div>
            )}
          </div>
          <div className="field">
            <label className="caps" htmlFor={`em-asunto-${proyectoId}`}>Asunto</label>
            <input id={`em-asunto-${proyectoId}`} value={asunto} onChange={e => setB({ ...b, asunto: e.target.value })} />
          </div>
          <div className="field">
            <label className="caps" htmlFor={`em-cuerpo-${proyectoId}`}>Texto</label>
            <textarea id={`em-cuerpo-${proyectoId}`} rows={Math.min(16, cuerpo.split('\n').length + 1)} value={cuerpo} onChange={e => setB({ ...b, cuerpo: e.target.value })} />
          </div>
          {faltan.length > 0 && <p className="nota aviso">Falta rellenar: {faltan.join(', ')}</p>}
          {error && <p className="nota error">{error}</p>}
          <div className="trk__emailpie">
            <button type="button" className="copy caps" onClick={onCerrar}>Ahora no</button>
            <button type="button" className="pill pill--sm" disabled={enviando || faltan.length > 0 || !b.para.trim()} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
