'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, type Compra } from '@/lib/supabase'
import { comercio } from '@/lib/movimientos'

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (1200 → 1.200).
const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const totalCompra = (c: Compra) => Number(c.base) * (1 + Number(c.iva_pct) / 100)

const MAX_BYTES = 4 * 1024 * 1024
const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
const IconMas = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

type Prefill = { movimientoId?: string; fecha: string; proveedor: string; total: string }
type Cargo = { id: string; fecha: string; importe: number; contraparte: string | null; concepto: string | null; compra_id: number | null }

export default function ComprasTab({ compras, reload }: { compras: Compra[]; reload: () => void }) {
  const [modal, setModal] = useState<Prefill | true | false>(false)
  // Cargos de trabajo del banco que todavía no tienen su factura en Compras.
  const [sinFactura, setSinFactura] = useState<Cargo[]>([])
  const cargarCargos = useCallback(async () => {
    const { data } = await supabase.from('movimientos').select('id,fecha,importe,contraparte,concepto,compra_id').eq('trabajo', true).eq('sin_factura_ok', false).order('fecha', { ascending: false })
    setSinFactura((data || []).filter((m: Cargo) => !m.compra_id && Number(m.importe) < 0))
  }, [])
  useEffect(() => { cargarCargos() }, [cargarCargos])
  const marcar = async (m: Cargo, patch: Record<string, unknown>) => {
    await supabase.from('movimientos').update({ ...patch, manual: true }).eq('id', m.id)
    cargarCargos()
  }
  const trasGuardar = async () => {
    setModal(false)
    await fetch('/api/bancos/conciliar', { method: 'POST' }).catch(() => null)
    reload(); cargarCargos()
  }
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

  // Como la web: los cargos del banco sin factura arriba; debajo, un bloque por trimestre con una fila por factura.
  return (
    <div className="col">
      <div className="acciones">
        <button type="button" className="pill pill--sm" onClick={() => setModal(true)}><IconMas />Nueva compra</button>
        <span className="nota">{compras.length} facturas de compra</span>
      </div>

      {sinFactura.length > 0 && (
        <section className="block" aria-label="Cargos de trabajo sin factura">
          <p className="label caps"><span>Cargos de trabajo sin factura · {sinFactura.length}</span><i className="rule" /></p>
          <p className="nota aviso">Salen en tu banco pero no tienen su factura en Compras: súbela para deducirla</p>
          <ul className="list">
            {sinFactura.map(m => (
              <li key={m.id} className="cg">
                <div className="cg__main">
                  <span className="fila__t">{comercio(m)}</span>
                  <span className="p__s caps">{fmtFecha(m.fecha)}</span>
                </div>
                <span className="num">€{eur(Math.abs(Number(m.importe)))}</span>
                <div className="cg__acts">
                  <button type="button" className="ghost" onClick={() => setModal({ movimientoId: m.id, fecha: m.fecha, proveedor: comercio(m), total: Math.abs(Number(m.importe)).toFixed(2) })}>Añadir factura</button>
                  <button type="button" className="copy caps" title="Ya tiene su factura (p. ej. un pago en dos veces)" onClick={() => marcar(m, { sin_factura_ok: true })}>Ya la tengo</button>
                  <button type="button" className="copy caps" onClick={() => marcar(m, { trabajo: false })}>No es de trabajo</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {compras.length === 0 && <p className="empty">Todavía no cargaste ninguna factura de compra.</p>}
      {Array.from(grupos.entries()).map(([k, cs]) => (
        <section key={k} className="block" aria-label={k}>
          <p className="label caps"><span>{k}</span><i className="rule" /><span className="label__m">€{eur(cs.reduce((s, c) => s + totalCompra(c), 0))}</span></p>
          <ul className="projs focus">
            {cs.map(c => <FilaCompra key={c.id} c={c} onBorrar={() => borrar(c)} />)}
          </ul>
        </section>
      ))}
      {modal && <ModalNuevaCompra inicial={modal === true ? undefined : modal} onClose={() => setModal(false)} onSaved={trasGuardar} />}
    </div>
  )
}

// Una compra: proveedor · concepto, la fecha (y el % deducible si no es todo), el total y un punto ámbar si
// falta su archivo. Al desplegar: base, IVA y total, el aviso de amortización, el archivo y borrar.
function FilaCompra({ c, onBorrar }: { c: Compra; onBorrar: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const total = totalCompra(c)
  return (
    <li className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--fa" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="fa__t">{c.proveedor}{c.concepto ? <span> · {c.concepto}</span> : null}</span>
        <span className="p__s caps">{fmtFecha(c.fecha)}{Number(c.deducible_pct) < 100 ? ` · Deducible ${Number(c.deducible_pct)}%` : ''}</span>
        <span className="p__v num">€{eur(total)}</span>
        <span className="st" title={c.archivo_path ? c.archivo_nombre || 'Con archivo' : 'Sin archivo'}>
          {!c.archivo_path && <i className="dot dot--wait" aria-hidden="true" />}<span className="sr">{c.archivo_path ? 'Con archivo' : 'Sin archivo'}</span>
        </span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          <dl className="desg desg--compra">
            <div><dt>Base</dt><dd className="num">€{eur(Number(c.base))}</dd></div>
            <div><dt>IVA {Number(c.iva_pct)}%</dt><dd className="num">+€{eur(total - Number(c.base))}</dd></div>
            <div className="desg__t"><dt>Total</dt><dd className="num">€{eur(total)}</dd></div>
          </dl>
          {Number(c.deducible_pct) < 100 && <p className="nota">Deducible {Number(c.deducible_pct)}% (uso profesional)</p>}
          {Number(c.base) >= 300 && <p className="nota">Más de 300€: puede que se amortice en varios años</p>}
          <div className="p__foot">
            {c.archivo_path
              ? <a className="copy caps" href={`/api/compras/archivo?id=${c.id}`} target="_blank" rel="noopener noreferrer" title={c.archivo_nombre || 'Ver archivo'}>Ver archivo →</a>
              : <span className="nota">Sin archivo</span>}
            <span className="foot__r"><button type="button" className="copy caps borrar" onClick={onBorrar}>Borrar</button></span>
          </div>
        </div>
      )}
    </li>
  )
}

function ModalNuevaCompra({ inicial, onClose, onSaved }: { inicial?: Prefill; onClose: () => void; onSaved: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fecha, setFecha] = useState(inicial?.fecha || hoy())
  const [proveedor, setProveedor] = useState(inicial?.proveedor || '')
  const [concepto, setConcepto] = useState('')
  const [iva, setIva] = useState('21')
  const [base, setBase] = useState(inicial ? (Number(inicial.total) / 1.21).toFixed(2) : '')
  const [total, setTotal] = useState(inicial?.total || '')
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

  // Campos de una sola línea y botones de la web (mismo estado y mismas acciones que antes).
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__head"><h2>Nueva compra</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="modal__campos">
          <div className="field">
            <label className="caps" htmlFor="nc-archivo">Factura (PDF o foto, máx. 4 MB)</label>
            <input id="nc-archivo" type="file" accept="application/pdf,image/*" onChange={e => setArchivo(e.target.files?.[0] || null)} className="archivo" />
          </div>
          <div className="modal__par">
            <div className="field">
              <label className="caps" htmlFor="nc-fecha">Fecha de la factura</label>
              <input id="nc-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="field">
              <label className="caps" htmlFor="nc-proveedor">Proveedor</label>
              <input id="nc-proveedor" value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej: Apple, Amazon…" />
            </div>
          </div>
          <div className="field">
            <label className="caps" htmlFor="nc-concepto">Concepto (opcional)</label>
            <input id="nc-concepto" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: iPhone para trabajo" />
          </div>
          <div className="modal__trio">
            <div className="field">
              <label className="caps" htmlFor="nc-iva">IVA</label>
              <select id="nc-iva" value={iva} onChange={e => cambiarIva(e.target.value)}>
                <option value="21">21%</option><option value="10">10%</option><option value="4">4%</option><option value="0">Sin IVA</option>
              </select>
              <Chevron />
            </div>
            <div className="field">
              <label className="caps" htmlFor="nc-base">Base imponible (€)</label>
              <input id="nc-base" type="number" step="0.01" value={base} onChange={e => cambiarBase(e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label className="caps" htmlFor="nc-total">Total con IVA (€)</label>
              <input id="nc-total" type="number" step="0.01" value={total} onChange={e => cambiarTotal(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="field">
            <label className="caps" htmlFor="nc-deducible">% de uso profesional (deducible)</label>
            <input id="nc-deducible" type="number" min="0" max="100" value={deducible} onChange={e => setDeducible(e.target.value)} />
            <p className="nota field__nota">Si también lo usás para cosas personales, poné solo la parte profesional (p. ej. 50).</p>
          </div>
        </div>
        {error && <p className="nota error modal__nota">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
          <button type="button" className="pill pill--sm" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar compra'}</button>
        </div>
      </div>
    </div>
  )
}
