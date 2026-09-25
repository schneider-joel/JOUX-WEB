'use client'

import { useState } from 'react'
import type { Compra } from '@/lib/supabase'

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const totalCompra = (c: Compra) => Number(c.base) * (1 + Number(c.iva_pct) / 100)

const input: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
const MAX_BYTES = 4 * 1024 * 1024
const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
const IconArchivo = () => <svg {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
const IconX = () => <svg {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg>

export default function ComprasTab({ compras, reload }: { compras: Compra[]; reload: () => void }) {
  const [modal, setModal] = useState(false)
  const ordenadas = [...compras].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const grupos = new Map<string, Compra[]>()
  for (const c of ordenadas) {
    const k = `${c.fecha.slice(0, 4)} · T${Math.ceil(Number(c.fecha.slice(5, 7)) / 3)}`
    grupos.set(k, [...(grupos.get(k) || []), c])
  }

  const borrar = async (c: Compra) => {
    if (!confirm(`¿Borrar la compra de ${c.proveedor} (${eur(totalCompra(c))}€) y su archivo?`)) return
    await fetch(`/api/compras?id=${c.id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Facturas de compra <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {compras.length}</span></div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Nueva compra</button>
      </div>
      {compras.length === 0 && <div className="chart-empty">Todavía no cargaste ninguna factura de compra.</div>}
      {Array.from(grupos.entries()).map(([k, cs]) => (
        <div key={k} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 6px' }}>
            <span>{k}</span><span>€{eur(cs.reduce((s, c) => s + totalCompra(c), 0))}</span>
          </div>
          {cs.map(c => (
            <div key={c.id} className="row">
              <div className="row-main">
                <div className="row-title">{c.proveedor}{c.concepto ? <span style={{ color: 'var(--text3)' }}> · {c.concepto}</span> : null}</div>
                <div className="row-sub">
                  {fmtFecha(c.fecha)} · Base €{eur(Number(c.base))} + IVA {Number(c.iva_pct)}%
                  {Number(c.deducible_pct) < 100 ? ` · Deducible ${Number(c.deducible_pct)}%` : ''}
                  {Number(c.base) >= 300 ? ' · Más de 300€: puede que se amortice en varios años' : ''}
                </div>
              </div>
              <div className="row-side">
                <span className="row-amount">€{eur(totalCompra(c))}</span>
                {c.archivo_path && (
                  <a className="icon-btn accent" href={`/api/compras/archivo?id=${c.id}`} target="_blank" rel="noopener noreferrer" title={c.archivo_nombre || 'Ver archivo'}><IconArchivo /></a>
                )}
                <button className="icon-btn danger" onClick={() => borrar(c)} title="Borrar"><IconX /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {modal && <ModalNuevaCompra onClose={() => setModal(false)} onSaved={() => { setModal(false); reload() }} />}
    </div>
  )
}

function ModalNuevaCompra({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fecha, setFecha] = useState(hoy())
  const [proveedor, setProveedor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [iva, setIva] = useState('21')
  const [base, setBase] = useState('')
  const [total, setTotal] = useState('')
  const [deducible, setDeducible] = useState('100')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const factor = 1 + Number(iva) / 100
  const cambiarBase = (v: string) => { setBase(v); setTotal(v ? (Number(v) * factor).toFixed(2) : '') }
  const cambiarTotal = (v: string) => { setTotal(v); setBase(v ? (Number(v) / factor).toFixed(2) : '') }
  const cambiarIva = (v: string) => { setIva(v); if (base) setTotal((Number(base) * (1 + Number(v) / 100)).toFixed(2)) }

  const guardar = async () => {
    setError('')
    if (!proveedor || !base || !fecha) { setError('Completá fecha, proveedor e importe.'); return }
    if (archivo && archivo.size > MAX_BYTES) { setError('El archivo pesa más de 4 MB. Probá con un PDF o una foto más liviana.'); return }
    setGuardando(true)
    const fd = new FormData()
    if (archivo) fd.append('archivo', archivo)
    fd.append('fecha', fecha)
    fd.append('proveedor', proveedor)
    fd.append('concepto', concepto)
    fd.append('base', base)
    fd.append('iva_pct', iva)
    fd.append('deducible_pct', deducible || '100')
    const res = await fetch('/api/compras', { method: 'POST', body: fd })
    const json = await res.json().catch(() => ({}))
    setGuardando(false)
    if (!res.ok) { setError(json.error || 'No se pudo guardar.'); return }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
          Nueva compra <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Factura (PDF o foto, máx. 4 MB)</label>
          <input type="file" accept="application/pdf,image/*" onChange={e => setArchivo(e.target.files?.[0] || null)} style={{ ...input, padding: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Fecha de la factura</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Proveedor</label>
            <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej: Apple, Amazon…" style={input} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Concepto (opcional)</label>
          <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: iPhone para trabajo" style={input} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>IVA</label>
            <select value={iva} onChange={e => cambiarIva(e.target.value)} style={input}>
              <option value="21">21%</option><option value="10">10%</option><option value="4">4%</option><option value="0">Sin IVA</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Base imponible (€)</label>
            <input type="number" step="0.01" value={base} onChange={e => cambiarBase(e.target.value)} placeholder="0.00" style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Total con IVA (€)</label>
            <input type="number" step="0.01" value={total} onChange={e => cambiarTotal(e.target.value)} placeholder="0.00" style={input} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>% de uso profesional (deducible)</label>
          <input type="number" min="0" max="100" value={deducible} onChange={e => setDeducible(e.target.value)} style={input} />
          <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>Si también lo usás para cosas personales, poné solo la parte profesional (p. ej. 50).</div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif', opacity: guardando ? 0.6 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
