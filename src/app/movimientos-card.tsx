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

// Con el € delante y punto de miles siempre, como el resto del hub (mismas cifras y decimales).
const eur = (n: number) => (n < 0 ? '−' : '') + '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.abs(n))
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const aCobrar = (f: FacturaMin) => Math.round(Number(f.importe) * (f.tipo_factura === 'dentro_ue' ? 1.06 : 1) * 100) / 100
const ETIQUETA: Record<Clase, string> = { cobro: 'cobro', ingreso: 'ingreso', gasto: 'gasto', interno: 'traspaso', personal: 'personal', reembolso: 'reembolso' }
// "NRC 1006489961626TY071L079" → "NRC": la parte estable del nombre para una regla.
const patronDe = (texto: string) => texto.replace(/[\s*]*\S*\d{4,}\S*$/, '').trim() || texto

const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

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
    return { cobros: suma('cobro'), ingresos: suma('ingreso'), gastos: suma('gasto'), reembolsos: suma('reembolso') }
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
  // Como la web: el resumen del mes en columnas y una fila por movimiento (comercio, una línea pequeña e importe).
  return (
    <>
      <section className="block" aria-label="Este mes">
        <p className="label caps"><span>Este mes</span><i className="rule" /></p>
        <dl className="split split--4">
          {([['Cobros de clientes', resumen.cobros, 'up'], ['Otros ingresos', resumen.ingresos, ''], ['Gastos', resumen.gastos, ''], ['Te devolvieron', resumen.reembolsos, 'dim']] as [string, number, string][]).map(([l, v, cls]) => (
            <div key={l}><dt className="caps">{l}</dt><dd><span className={`num${cls ? ` ${cls}` : ''}`}>{eur(v)}</span></dd></div>
          ))}
        </dl>
      </section>

      <section className="block" aria-label="Movimientos">
        <p className="label caps"><span>Movimientos</span><i className="rule" /></p>
        <div className="chips__row">
          {([['todos', 'Todos'], ['sin_categoria', 'Sin categoría'], ['ingresos', 'Ingresos'], ['trabajo', 'Trabajo sin factura']] as [Filtro, string][]).map(([f, l]) => (
            <button key={f} type="button" className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}><span>{l}<b className="dim">{conteo[f]}</b></span></button>
          ))}
        </div>
        <p className="nota">Toca uno para clasificarlo o vincularlo con facturas</p>
        {visibles.length === 0 ? <p className="empty">Nada por aquí.</p> : (
          <ul className="projs focus">
            {visibles.map(m => {
              const fs = facturasDe(m.id)
              const entra = Number(m.importe) > 0
              return (
                <li key={m.id}>
                  <button type="button" className="mv" onClick={() => setEditando(m)}>
                    <span className="mv__main">
                      <span className="mv__t">{comercio(m)}</span>
                      <span className="p__s caps">
                        {fechaCorta(m.fecha)} · {nombreCuenta(m.cuenta_uid)}
                        {m.clase && ` · ${ETIQUETA[m.clase]}`}
                        {m.categoria && ` · ${m.categoria}`}
                        {fs.length > 0 && ` · ${fs.map(f => f.numero).join(', ')}`}
                        {m.estado === 'PDNG' && <> · <span className="aviso" title="Pago con tarjeta todavía sin contabilizar">pendiente</span></>}
                        {m.trabajo && !m.compra_id && Number(m.importe) < 0 && <> · <span className="aviso" title="Gasto de trabajo sin factura en Compras">sin factura</span></>}
                        {m.compra_id && <> · <span className="up" title="Tiene su factura en Compras">factura ✓</span></>}
                      </span>
                    </span>
                    <span className={`num mv__v${entra ? ' up' : m.clase === 'interno' ? ' dim' : ''}`}>{entra ? '+' : ''}{eur(Number(m.importe))}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editando && (
        <EditorMovimiento m={editando} partidas={partidas} facturas={facturas}
          onClose={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); await cargar(); onCambio() }} />
      )}
    </>
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

  // Campos de una sola línea y botones de la web (mismo estado y mismas acciones que antes).
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal__head modal__head--mv">
          <div>
            <h2>{comercio(m)}</h2>
            <p className="nota">{fechaCorta(m.fecha)} · <span className="mono">{eur(Number(m.importe))}</span></p>
            {m.concepto && <p className="nota modal__concepto">{m.concepto}</p>}
          </div>
          <button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal__campos">
          <div className="field">
            <label className="caps" htmlFor="mv-clase">Qué es</label>
            <select id="mv-clase" value={elegidas.length ? 'cobro' : clase} disabled={elegidas.length > 0} onChange={e => setClase(e.target.value as Clase)}>
              {elegidas.length > 0 && <option value="cobro">Cobro de cliente</option>}
              {CLASES.filter(c => c.value !== 'cobro' && (ingreso || (c.value !== 'ingreso' && c.value !== 'reembolso'))).map(c => <option key={c.value} value={c.value}>{ingreso && c.value === 'gasto' ? 'Devolución de una compra' : c.label}</option>)}
            </select>
            <Chevron />
          </div>

          {clase === 'gasto' && !elegidas.length && (
            <>
              <div className="field">
                <label className="caps" htmlFor="mv-partida">Partida del presupuesto</label>
                <select id="mv-partida" value={categoria} onChange={e => setCategoria(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {partidas.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <Chevron />
              </div>
              <label className="check">
                <input type="checkbox" checked={trabajo} onChange={e => setTrabajo(e.target.checked)} />
                Es un gasto de trabajo (debería tener su factura en Compras)
              </label>
            </>
          )}

          {ingreso && candidatas.length > 0 && (
            <div className="cands">
              <p className="caps field__l">¿Qué facturas paga? {elegidas.length > 0 && <span className={Math.abs(suma - Number(m.importe)) < 0.02 ? 'up' : 'aviso'}>· suman {eur(suma)}</span>}</p>
              <div className="cands__lista">
                {candidatas.map(f => (
                  <label key={f.id} className="check cands__f">
                    <input type="checkbox" checked={elegidas.includes(f.id)} onChange={e => setElegidas(e.target.checked ? [...elegidas, f.id] : elegidas.filter(x => x !== f.id))} />
                    <span className="cands__t">{f.numero} · {f.cliente} <span className="dim">· {fechaCorta(f.fecha)}{f.estado === 'cobrada' ? ' · cobrada' : ''}</span></span>
                    <span className="num">{eur(aCobrar(f))}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!elegidas.length && (
            <div className="sum regla">
              <label className="check">
                <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} />
                Aplicar siempre a los movimientos que contengan:
              </label>
              {recordar && <div className="field"><input aria-label="Texto que buscar" value={patron} onChange={e => setPatron(e.target.value)} /></div>}
            </div>
          )}
        </div>

        <div className="modal__foot">
          <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
          <button type="button" className="pill pill--sm" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
