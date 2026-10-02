'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, batchQuery } from '@/lib/supabase'
import { CLASES, comercio, palabrasClave, textoDe, type Clase } from '@/lib/movimientos'

type Movimiento = {
  id: string; cuenta_uid: string; fecha: string; importe: number; moneda: string | null
  contraparte: string | null; concepto: string | null; estado: string | null
  clase: Clase | null; categoria: string | null; trabajo: boolean; compra_id: number | null; manual: boolean
}
type FacturaMin = { id: number; numero: string | null; cliente: string; importe: number; tipo_factura: string | null; estado: string; fecha: string; movimiento_id: string | null; fiscal: boolean | null }
type CuentaBanco = { uid: string; aspsp: string; iban: string | null; nombre: string | null }
type Filtro = 'todos' | 'sin_categoria' | 'ingresos' | 'trabajo'

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const aCobrar = (f: FacturaMin) => Math.round(Number(f.importe) * (f.tipo_factura === 'dentro_ue' ? 1.06 : 1) * 100) / 100
const ETIQUETA: Record<Clase, string> = { cobro: 'cobro', ingreso: 'ingreso', gasto: 'gasto', interno: 'traspaso', personal: 'personal' }
// "NRC 1006489961626TY071L079" → "NRC": la parte estable del nombre para una regla.
const patronDe = (texto: string) => texto.replace(/[\s*]*\S*\d{4,}\S*$/, '').trim() || texto

const campo: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }

export default function MovimientosCard({ cuentasBanco, version, onCambio }: { cuentasBanco: CuentaBanco[]; version: number; onCambio: () => void }) {
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [facturas, setFacturas] = useState<FacturaMin[]>([])
  const [partidas, setPartidas] = useState<string[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<Movimiento | null>(null)

  const cargar = useCallback(async () => {
    const [m, f, fi, va] = await batchQuery([
      supabase.from('movimientos').select('id,cuenta_uid,fecha,importe,moneda,contraparte,concepto,estado,clase,categoria,trabajo,compra_id,manual').order('fecha', { ascending: false }).limit(500),
      supabase.from('facturas').select('id,numero,cliente,importe,tipo_factura,estado,fecha,movimiento_id,fiscal').order('fecha', { ascending: false }),
      supabase.from('presupuesto_fijos').select('nombre'),
      supabase.from('presupuesto_variables').select('nombre'),
    ])
    setMovs(m.data || []); setFacturas(f.data || [])
    setPartidas(Array.from(new Set([...(fi.data || []), ...(va.data || [])].map((p: { nombre: string }) => p.nombre))))
  }, [])
  useEffect(() => { cargar() }, [cargar, version])

  const nombreCuenta = (uid: string) => {
    const c = cuentasBanco.find(x => x.uid === uid)
    return c ? `${c.aspsp}${c.iban ? ` ·${c.iban.slice(-4)}` : c.nombre ? ` · ${c.nombre}` : ''}` : ''
  }
  const facturasDe = (id: string) => facturas.filter(f => f.movimiento_id === id)

  // Resumen del mes en curso (los traspasos no cuentan).
  const mes = new Date().toISOString().slice(0, 7)
  const resumen = useMemo(() => {
    const delMes = movs.filter(m => m.fecha.startsWith(mes))
    const suma = (c: Clase) => delMes.filter(m => m.clase === c).reduce((s, m) => s + Number(m.importe), 0)
    return { cobros: suma('cobro'), ingresos: suma('ingreso'), gastos: suma('gasto'), personal: suma('personal') }
  }, [movs, mes])

  const visibles = movs.filter(m =>
    filtro === 'todos' ? true :
    filtro === 'ingresos' ? Number(m.importe) > 0 && (m.clase === 'cobro' || m.clase === 'ingreso') :
    filtro === 'trabajo' ? m.trabajo && !m.compra_id && Number(m.importe) < 0 :
    m.clase === 'gasto' && !m.categoria && !m.trabajo && Number(m.importe) < 0)
  const conteo: Record<Filtro, number> = {
    todos: movs.length,
    sin_categoria: movs.filter(m => m.clase === 'gasto' && !m.categoria && !m.trabajo && Number(m.importe) < 0).length,
    ingresos: movs.filter(m => Number(m.importe) > 0 && (m.clase === 'cobro' || m.clase === 'ingreso')).length,
    trabajo: movs.filter(m => m.trabajo && !m.compra_id && Number(m.importe) < 0).length,
  }

  if (!movs.length) return null
  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="card-title">Movimientos</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>Toca uno para clasificarlo o vincularlo con facturas</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['todos', 'Todos'], ['sin_categoria', 'Sin categoría'], ['ingresos', 'Ingresos'], ['trabajo', 'Trabajo sin factura']] as [Filtro, string][]).map(([f, l]) => (
            <button key={f} className={`btn${filtro === f ? ' btn-primary' : ''}`} onClick={() => setFiltro(f)}>{l} · {conteo[f]}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[['Cobros de clientes', resumen.cobros, 'var(--green)'], ['Otros ingresos', resumen.ingresos, 'var(--text)'], ['Gastos', resumen.gastos, 'var(--text)'], ['Personal (no cuenta)', resumen.personal, 'var(--text3)']].map(([l, v, c]) => (
          <div key={l as string} style={{ background: 'var(--surface2)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l as string} · este mes</div>
            <div className="mono" style={{ fontSize: 15, marginTop: 4, color: c as string }}>{eur(v as number)}</div>
          </div>
        ))}
      </div>

      {visibles.map(m => {
        const fs = facturasDe(m.id)
        return (
          <div key={m.id} className="row" onClick={() => setEditando(m)} style={{ cursor: 'pointer' }}>
            <div style={{ width: 54, fontSize: 11.5, color: 'var(--text3)', flexShrink: 0 }}>{fechaCorta(m.fecha)}</div>
            <div className="row-main">
              <div className="row-title">{comercio(m)}</div>
              <div className="row-sub">
                {nombreCuenta(m.cuenta_uid)}
                {m.clase && ` · ${ETIQUETA[m.clase]}`}
                {m.categoria && ` · ${m.categoria}`}
                {fs.length > 0 && ` · ${fs.map(f => f.numero).join(', ')}`}
              </div>
            </div>
            <div className="row-side">
              {m.estado === 'PDNG' && <span className="pill pill-amber" title="Pago con tarjeta todavía sin contabilizar">pendiente</span>}
              {m.trabajo && !m.compra_id && Number(m.importe) < 0 && <span className="pill pill-amber" title="Gasto de trabajo sin factura en Compras">sin factura</span>}
              {m.compra_id && <span className="pill pill-green" title="Tiene su factura en Compras">factura ✓</span>}
              <span className="row-amount" style={{ color: Number(m.importe) > 0 ? 'var(--green)' : m.clase === 'interno' ? 'var(--text3)' : 'var(--text2)' }}>
                {Number(m.importe) > 0 ? '+' : ''}{eur(Number(m.importe))}
              </span>
            </div>
          </div>
        )
      })}
      {visibles.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '12px 0' }}>Nada por aquí.</div>}

      {editando && (
        <EditorMovimiento m={editando} partidas={partidas} facturas={facturas}
          onClose={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); await cargar(); onCambio() }} />
      )}
    </div>
  )
}

function EditorMovimiento({ m, partidas, facturas, onClose, onGuardado }: { m: Movimiento; partidas: string[]; facturas: FacturaMin[]; onClose: () => void; onGuardado: () => void }) {
  const ingreso = Number(m.importe) > 0
  const [clase, setClase] = useState<Clase>(m.clase && m.clase !== 'cobro' ? m.clase : ingreso ? 'ingreso' : 'gasto')
  const [categoria, setCategoria] = useState(m.categoria || '')
  const [trabajo, setTrabajo] = useState(m.trabajo)
  const [recordar, setRecordar] = useState(false)
  const [patron, setPatron] = useState(patronDe(comercio(m)))
  const vinculadas = facturas.filter(f => f.movimiento_id === m.id).map(f => f.id)
  const [elegidas, setElegidas] = useState<number[]>(vinculadas)
  const [guardando, setGuardando] = useState(false)

  // Facturas que este ingreso podría pagar: las pendientes y las cobradas sin pago enlazado.
  // Primero las del cliente que coincide con el ordenante; a veces la factura
  // se emite después del cobro, así que entran hasta 45 días posteriores.
  const desde = new Date(new Date(m.fecha).getTime() - 150 * 864e5).toISOString().slice(0, 10)
  const hasta = new Date(new Date(m.fecha).getTime() + 45 * 864e5).toISOString().slice(0, 10)
  const texto = textoDe(m)
  const delCliente = (f: FacturaMin) => palabrasClave([f.cliente]).some(k => texto.includes(k))
  const candidatas = ingreso ? facturas
    .filter(f => f.fiscal !== false && f.fecha <= hasta && (f.movimiento_id === m.id || (!f.movimiento_id && (f.estado === 'pendiente' || f.fecha >= desde))))
    .sort((a, b) => Number(delCliente(b)) - Number(delCliente(a)) || Number(b.estado === 'pendiente') - Number(a.estado === 'pendiente') || b.fecha.localeCompare(a.fecha))
    .slice(0, 40) : []
  const suma = candidatas.filter(f => elegidas.includes(f.id)).reduce((s, f) => s + aCobrar(f), 0)

  const guardar = async () => {
    setGuardando(true)
    const esCobro = elegidas.length > 0
    await supabase.from('movimientos').update({ clase: esCobro ? 'cobro' : clase, categoria: esCobro ? null : categoria || null, trabajo: !ingreso && trabajo, manual: true }).eq('id', m.id)
    for (const id of vinculadas.filter(id => !elegidas.includes(id))) await supabase.from('facturas').update({ movimiento_id: null }).eq('id', id)
    for (const id of elegidas.filter(id => !vinculadas.includes(id))) await supabase.from('facturas').update({ estado: 'cobrada', fecha_cobro: m.fecha, movimiento_id: m.id }).eq('id', id)
    if (recordar && patron.trim()) {
      await supabase.from('reglas_movimientos').insert([{ patron: patron.trim(), clase, categoria: categoria || null, trabajo: !ingreso && trabajo }])
      await fetch('/api/bancos/conciliar', { method: 'POST' }).catch(() => null)
    }
    onGuardado()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{comercio(m)}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{fechaCorta(m.fecha)} · <span className="mono">{eur(Number(m.importe))}</span></div>
            {m.concepto && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{m.concepto}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={etiqueta}>Qué es</label>
          <select value={elegidas.length ? 'cobro' : clase} disabled={elegidas.length > 0} onChange={e => setClase(e.target.value as Clase)} style={campo}>
            {elegidas.length > 0 && <option value="cobro">Cobro de cliente</option>}
            {CLASES.filter(c => c.value !== 'cobro' && (ingreso || c.value !== 'ingreso')).map(c => <option key={c.value} value={c.value}>{ingreso && c.value === 'gasto' ? 'Devolución de una compra' : c.label}</option>)}
          </select>
        </div>

        {clase === 'gasto' && !elegidas.length && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={etiqueta}>Partida del presupuesto</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} style={campo}>
                <option value="">Sin categoría</option>
                {partidas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={trabajo} onChange={e => setTrabajo(e.target.checked)} />
              Es un gasto de trabajo (debería tener su factura en Compras)
            </label>
          </>
        )}

        {ingreso && candidatas.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={etiqueta}>¿Qué facturas paga? {elegidas.length > 0 && <span className="mono" style={{ color: Math.abs(suma - Number(m.importe)) < 0.02 ? 'var(--green)' : 'var(--amber)' }}>· suman {eur(suma)}</span>}</label>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 6 }}>
              {candidatas.map(f => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elegidas.includes(f.id)} onChange={e => setElegidas(e.target.checked ? [...elegidas, f.id] : elegidas.filter(x => x !== f.id))} />
                  <span style={{ flex: 1 }}>{f.numero} · {f.cliente} <span style={{ color: 'var(--text3)' }}>· {fechaCorta(f.fecha)}{f.estado === 'cobrada' ? ' · cobrada' : ''}</span></span>
                  <span className="mono">{eur(aCobrar(f))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {!elegidas.length && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} />
              Aplicar siempre a los movimientos que contengan:
            </label>
            {recordar && <input value={patron} onChange={e => setPatron(e.target.value)} style={{ ...campo, marginTop: 8 }} />}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} className="btn" style={{ padding: '9px 16px' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '9px 16px' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
