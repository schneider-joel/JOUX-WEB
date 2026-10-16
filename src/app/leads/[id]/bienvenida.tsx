'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VistaBienvenida } from '@/lib/bienvenida'

const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)

// Bienvenida al aceptar: vista previa del email (con la carpeta de Drive) y de la factura del pago 1,
// y «Emitir y enviar». Nada sale ni se factura hasta pulsar el botón (GET/POST /api/proyectos/[id]/bienvenida).
export default function Bienvenida({ proyectoId }: { proyectoId: number }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState<VistaBienvenida | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setV(null); setError('')
    fetch(`/api/proyectos/${proyectoId}/bienvenida`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error || 'No se pudo preparar'); else setV(j)
    }).catch(() => setError('No se pudo preparar'))
  }, [abierto, proyectoId])

  const enviar = async () => {
    setEnviando(true); setError('')
    const r = await fetch(`/api/proyectos/${proyectoId}/bienvenida`, { method: 'POST' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo enviar'); router.refresh(); return }
    setHecho(j.factura ? `Enviada con la factura ${j.factura}${j.pdf ? ' en PDF' : ' (enlace: no se pudo generar el PDF)'}.` : 'Enviada.')
    router.refresh()
  }

  if (hecho) return <p className="nota ok">✉ Bienvenida {hecho}</p>
  if (!abierto) return <button type="button" className="pill pill--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAbierto(true)}>Bienvenida{' '}y factura →</button>

  const f = v?.factura
  return (
    <div className="block" style={{ gap: 10 }}>
      <p className="label caps"><span>Bienvenida{f ? ' · factura del pago 1' : ''}</span><i className="rule" /></p>
      {!v && !error && <p className="nota">Preparando…</p>}
      {v && (
        <>
          {v.enviada && <p className="nota ok">Ya se envió{v.enviada.includes('T') ? ` el ${new Date(v.enviada).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}.</p>}
          {f && (
            <>
              {f.prueba && <p className="nota aviso caps">Prueba · sin validez fiscal · no consume número</p>}
              <dl className="desg">
                <div><dt>Número</dt><dd className="num mono">{f.numero}{f.id ? '' : ' (previsto)'}</dd></div>
                <div><dt>Base</dt><dd className="num">{eur(f.base)}</dd></div>
                {f.espana && <div><dt>IVA 21 %</dt><dd className="num">{eur(f.iva)}</dd></div>}
                {f.espana && <div><dt>Retención 15 %</dt><dd className="num">{eur(-f.ret)}</dd></div>}
                <div className="desg__t"><dt>A cobrar</dt><dd className="num">{eur(f.total)}</dd></div>
              </dl>
              {!f.espana && <p className="nota">Cliente fuera de España: sin IVA ni retención.</p>}
            </>
          )}
          <dl className="meta lead__meta">
            <div><dt>De</dt><dd>{v.remitente}</dd></div>
            <div><dt>Para</dt><dd>{v.para || '—'}</dd></div>
            <div><dt>Asunto</dt><dd>{v.asunto}</dd></div>
            {f && <div><dt>Adjunto</dt><dd>Factura en PDF</dd></div>}
          </dl>
          <pre className="nota" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{v.cuerpo}</pre>
          {!v.drive && <p className="nota aviso">Sin carpeta de Drive: el email pide el material por respuesta o WeTransfer.</p>}
          {v.bloqueo && <p className="nota error">{v.bloqueo}</p>}
        </>
      )}
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={() => { setAbierto(false); setError('') }}>Cerrar</button>
        {v && !v.enviada && (
          <button type="button" className="pill pill--sm" disabled={enviando || !!v.bloqueo} onClick={enviar}>
            {enviando ? 'Enviando…' : f && !f.id ? 'Emitir y enviar' : 'Enviar'}
          </button>
        )}
      </div>
    </div>
  )
}
