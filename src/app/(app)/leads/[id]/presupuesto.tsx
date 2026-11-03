'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type PresupuestoFicha = {
  id: number; token: string; estado: 'enviado' | 'aceptado' | 'anulado'; concepto: string; precio: number | null; tarifa_dia: number | null
  caduca: string | null; aceptado_at: string | null; aceptado_nombre: string | null; aceptado_ip: string | null; version: number | null
}

const PUBLICA = 'https://joux-web.vercel.app'
const eur = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions).format(n) + ' €'
const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

// Presupuesto con aceptación online: Joel lo prepara aquí y pega el enlace en su email de propuesta. El cliente
// acepta en /aceptar/<token> (casilla de las condiciones vigentes) y eso gana el lead. Uno vivo por lead.
export default function Presupuesto({ leadId, modo, idioma, inicial, actual }: {
  leadId: number; modo: 'cerrado' | 'dia'; idioma: string
  inicial: { concepto: string; plan: string; precio: number | null }; actual: PresupuestoFicha | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({ concepto: inicial.concepto, plan: inicial.plan, precio: inicial.precio ? String(inicial.precio) : '', tarifa_dia: '', dias: '', incluye: '', plazo: '', caduca: '', idioma: idioma === 'en' ? 'en' : 'es' })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  const crear = async () => {
    setOcupado(true); setError('')
    const r = await fetch(`/api/leads/${leadId}/presupuesto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo crear'); return }
    setAbierto(false); router.refresh()
  }
  const anular = async () => {
    if (!actual || !confirm('¿Anular este presupuesto? El enlace dejará de servir.')) return
    setOcupado(true); setError('')
    const r = await fetch(`/api/leads/${leadId}/presupuesto?p=${actual.id}`, { method: 'DELETE' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo anular'); return }
    router.refresh()
  }
  const enlace = actual ? `${PUBLICA}/aceptar/${actual.token}` : ''
  const copiar = async () => { await navigator.clipboard.writeText(enlace).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 1600) }

  if (actual?.estado === 'aceptado') return (
    <div className="block" style={{ gap: 6 }}>
      <p className="nota ok">Aceptado por {actual.aceptado_nombre} el {fecha(actual.aceptado_at!)}{actual.version ? ` · condiciones v${actual.version}` : ''}</p>
      <p className="nota dim">{actual.concepto} · {actual.precio != null ? eur(Number(actual.precio)) : `${eur(Number(actual.tarifa_dia))}/día`}{actual.aceptado_ip ? ` · IP ${actual.aceptado_ip}` : ''}</p>
      <a className="copy caps" href={enlace} target="_blank" rel="noopener noreferrer">Ver lo que aceptó ↗</a>
    </div>
  )

  if (!abierto) return (
    <div className="block" style={{ gap: 8 }}>
      {actual?.estado === 'enviado' && <>
        <p className="nota">{actual.concepto} · {actual.precio != null ? eur(Number(actual.precio)) : `${eur(Number(actual.tarifa_dia))}/día`} · sin aceptar{actual.caduca ? ` · válido hasta el ${new Date(`${actual.caduca}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="pill pill--sm" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
          <a className="ghost" href={enlace} target="_blank" rel="noopener noreferrer">Abrir</a>
          <button type="button" className="copy caps" disabled={ocupado} onClick={anular}>Anular</button>
        </div>
        <p className="nota dim">Pega el enlace en tu email de propuesta.</p>
      </>}
      {error && <p className="nota error">{error}</p>}
      <button type="button" className={actual?.estado === 'enviado' ? 'copy caps' : 'ghost'} style={{ alignSelf: 'flex-start' }} onClick={() => setAbierto(true)}>
        {actual?.estado === 'enviado' ? 'Hacer otro (anula este)' : 'Preparar presupuesto'}
      </button>
    </div>
  )

  const campo = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label className="caps" htmlFor={`pr-${k}`}>{label}</label>
      <input id={`pr-${k}`} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...props} />
    </div>
  )
  return (
    <div className="block" style={{ gap: 10 }}>
      {campo('concepto', 'Concepto', { placeholder: modo === 'cerrado' ? 'Web Estudio X · diseño Lino' : 'Treatment · spot', maxLength: 200 })}
      {campo('plan', 'Plan (opcional)', { maxLength: 80 })}
      {modo === 'cerrado'
        ? campo('precio', 'Precio total sin IVA (€)', { inputMode: 'decimal' })
        : <>{campo('tarifa_dia', 'Tarifa por día sin IVA (€)', { inputMode: 'decimal' })}{campo('dias', 'Días estimados', { inputMode: 'decimal' })}</>}
      <div className="field">
        <label className="caps" htmlFor="pr-incluye">Qué incluye (una línea por punto)</label>
        <textarea id="pr-incluye" rows={4} value={f.incluye} onChange={e => setF({ ...f, incluye: e.target.value })} />
      </div>
      {campo('plazo', 'Plazo (opcional)', { placeholder: '3 semanas desde que llega el material', maxLength: 120 })}
      {campo('caduca', 'Válido hasta (opcional)', { type: 'date' })}
      <div className="field">
        <label className="caps" htmlFor="pr-idioma">Idioma de la página</label>
        <span className="field__sel">
          <select id="pr-idioma" value={f.idioma} onChange={e => setF({ ...f, idioma: e.target.value })}>
            <option value="es">Español</option><option value="en">Inglés</option>
          </select>
        </span>
      </div>
      <p className="nota">El cliente verá el presupuesto y las condiciones vigentes de la marca. Al aceptar, el lead pasa a ganado con este precio; la bienvenida y la factura las sigues enviando tú.</p>
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={() => { setAbierto(false); setError('') }}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={ocupado || f.concepto.trim().length < 3} onClick={crear}>{ocupado ? 'Creando…' : 'Crear enlace'}</button>
      </div>
    </div>
  )
}
