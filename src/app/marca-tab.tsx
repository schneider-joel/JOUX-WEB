'use client'

import { useMemo, useState } from 'react'
import { desglose } from '@/lib/importes'
import { ETIQUETA_PAGO, siguienteNumero, type Marca, type PaisFiscal, type ProyectoAgencia } from '@/lib/marcas'

// Pestaña de una agencia (marca de precio cerrado): una fila por cliente con su web, el precio
// y los dos pagos. Cada «Facturar pago N» crea su propia factura (número correlativo, IVA y
// retención según el país) con crear_factura_pago() en la base de datos. En demo todo pasa en memoria.
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)
// Sin céntimos cuando no hay (990 €, no 990,00 €): la tabla respira más.
const eurCorto = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 } as Intl.NumberFormatOptions).format(n)
const PAIS_TXT: Record<PaisFiscal, string> = { ES: 'España · IVA 21 % − retención 15 %', UE: 'UE · sin IVA', EXT: 'Fuera de la UE · sin IVA' }
const paisTxt = (p: PaisFiscal | null) => p ? PAIS_TXT[p] : 'Sin datos fiscales'
const hoy = () => new Date().toISOString().slice(0, 10)
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const COLOR = { cobrada: 'var(--green)', pendiente: 'var(--amber)', sin_facturar: 'var(--text3)' }

// Lo que paga el cliente por una base (con IVA y retención si es de España).
const total = (base: number, pais: PaisFiscal | null) => desglose(base, pais === 'ES')?.total ?? base
export const conceptoPago = (marca: Marca, p: ProyectoAgencia, i: 0 | 1) => `${marca.nombre} · Web ${p.plan} (${p.web}) · ${ETIQUETA_PAGO[i]}`
// Por qué no se puede facturar todavía (la base de datos lo rechazaría igual).
const bloqueoFiscal = (p: ProyectoAgencia) => !p.pais ? `Faltan los datos fiscales de ${p.cliente}: añádelos en Facturación › Clientes.`
  : p.pais === 'UE' ? 'Cliente de la UE: sin alta en el ROI, consúltalo con el gestor antes de facturar.' : null

// Escrituras reales; sin ellas (demo) todo cambia solo en pantalla. Devuelven un error o null.
export type AccionesAgencia = {
  facturar: (proyectoId: number, pago: 1 | 2) => Promise<string | null>
  cobrar: (facturaId: number) => Promise<string | null>
  nuevo: (p: Omit<ProyectoAgencia, 'id' | 'pais' | 'pagos'>) => Promise<string | null>
}

type Props = {
  marca: Marca
  proyectos: ProyectoAgencia[]
  numerosExistentes: (string | undefined)[]     // para previsualizar el siguiente número
  clientes: { cliente: string; pais?: PaisFiscal | null }[]
  demo: boolean
  acciones?: AccionesAgencia
}
type Sel = { p: ProyectoAgencia; i: 0 | 1 }

export default function MarcaTab({ marca, proyectos: iniciales, numerosExistentes, clientes, demo, acciones }: Props) {
  // Demo: copia local que los botones modifican. Real: siempre lo que llega de la base de datos.
  const [local, setProyectos] = useState(iniciales.filter(p => p.marca === marca.key))
  const proyectos = acciones ? iniciales.filter(p => p.marca === marca.key) : local
  const [facturando, setFacturando] = useState<Sel | null>(null)
  const [viendo, setViendo] = useState<Sel | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [aviso, setAviso] = useState('')

  const numeros = [...numerosExistentes, ...proyectos.flatMap(p => p.pagos.map(x => x.numero))]
  const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 3500) }

  const tot = useMemo(() => proyectos.reduce((t, p) => {
    for (const pago of p.pagos) {
      const x = total(p.precio / 2, p.pais)
      if (pago.estado === 'cobrada') t.cobrado += x; else if (pago.estado === 'pendiente') t.pendiente += x; else t.porFacturar += x
    }
    return t
  }, { cobrado: 0, pendiente: 0, porFacturar: 0 }), [proyectos])

  const cambiarPago = (id: number, i: 0 | 1, patch: ProyectoAgencia['pagos'][number]) =>
    setProyectos(ps => ps.map(p => p.id !== id ? p : { ...p, pagos: (i === 0 ? [patch, p.pagos[1]] : [p.pagos[0], patch]) as ProyectoAgencia['pagos'] }))

  const confirmarFactura = async (numero: string) => {
    if (!facturando) return null
    if (acciones) {
      const error = await acciones.facturar(facturando.p.id, (facturando.i + 1) as 1 | 2)
      if (error) return error
    } else {
      cambiarPago(facturando.p.id, facturando.i, { estado: 'pendiente', numero, fecha: hoy() })
      avisar(`Demo · ${numero} creada solo en pantalla`)
    }
    setFacturando(null)
    return null
  }
  const marcarCobrada = async () => {
    if (!viendo) return null
    const pago = viendo.p.pagos[viendo.i]
    if (acciones) {
      const error = pago.facturaId ? await acciones.cobrar(pago.facturaId) : 'Factura no encontrada'
      if (error) return error
    } else {
      cambiarPago(viendo.p.id, viendo.i, { ...pago, estado: 'cobrada' })
      avisar('Demo · marcada como cobrada solo en pantalla')
    }
    setViendo(null)
    return null
  }
  const anadir = async (p: Omit<ProyectoAgencia, 'id'>) => {
    if (acciones) {
      const error = await acciones.nuevo({ marca: p.marca, cliente: p.cliente, web: p.web, plan: p.plan, precio: p.precio })
      if (error) return error
    } else {
      setProyectos(ps => [...ps, { ...p, id: -Date.now() }])
      avisar(`Demo · ${p.cliente} añadido solo en pantalla`)
    }
    setNuevo(false)
    return null
  }

  const ordenados = [...proyectos].sort((a, b) => a.cliente.localeCompare(b.cliente))

  return (
    <div>
      <div className="agencia-resumen">
        {([['Cobrado', tot.cobrado, 'var(--green)'], ['Pendiente', tot.pendiente, 'var(--amber)'], ['Por facturar', tot.porFacturar, 'var(--text2)']] as const).map(([l, v, c]) => (
          <div key={l}>
            <div className="agencia-resumen-etq"><i style={{ background: c }} />{l}</div>
            <div className="mono agencia-resumen-num">{eurCorto(Math.round(v))}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Clientes <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {proyectos.length}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {demo && <span className="mono" title="Datos de ejemplo: no se escribe nada en la base de datos" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--amber-dim)', color: 'var(--amber)' }}>DEMO</span>}
            <button className="btn" onClick={() => setNuevo(true)} style={{ whiteSpace: 'nowrap' }}>+ Cliente</button>
          </div>
        </div>
        {aviso && <div style={{ fontSize: 12, color: 'var(--text3)', margin: '-6px 0 10px' }}>{aviso}</div>}

        <div className="agencia-fila agencia-cabecera">
          <div>Cliente</div><div style={{ textAlign: 'right' }}>Precio</div><div>Al empezar</div><div>Al publicar</div>
        </div>
        {ordenados.length === 0 && <div className="chart-empty">Todavía no hay clientes en {marca.nombre}.</div>}
        {ordenados.map(p => (
          <div key={p.id} className="agencia-fila">
            <div style={{ minWidth: 0 }}>
              <div className="agencia-cliente">{p.cliente}</div>
              <a className="agencia-web" href={`https://${p.web}`} target="_blank" rel="noopener noreferrer">{p.web}</a>
            </div>
            <div className="mono agencia-precio">{eurCorto(p.precio)}</div>
            {([0, 1] as const).map(i => {
              const pago = p.pagos[i]
              const bloqueado = i === 1 && p.pagos[0].estado === 'sin_facturar'
              const facturada = pago.estado !== 'sin_facturar'
              return (
                <button key={i} className="agencia-pago" disabled={bloqueado}
                  onClick={() => facturada ? setViendo({ p, i }) : setFacturando({ p, i })}>
                  <span className="agencia-pago-etq">{i ? 'Al publicar' : 'Al empezar'}</span>
                  <span className="mono agencia-pago-num" style={{ color: facturada ? 'var(--text)' : 'var(--text3)' }}>
                    <i style={{ background: COLOR[pago.estado], opacity: facturada ? 1 : 0.35 }} />{eurCorto(total(p.precio / 2, p.pais))}
                  </span>
                  <span className="agencia-pago-sub">
                    {facturada ? <>{pago.numero} · <span style={{ color: COLOR[pago.estado] }}>{pago.estado}</span></>
                      : bloqueado ? 'tras el primer pago' : <span style={{ color: 'var(--accent-bright)' }}>Facturar →</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {facturando && (
        <div className="modal-bg" onClick={() => setFacturando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <ModalFacturarPago marca={marca} {...facturando} numero={siguienteNumero(numeros)} demo={demo} onConfirmar={confirmarFactura} onClose={() => setFacturando(null)} />
          </div>
        </div>
      )}
      {viendo && (
        <div className="modal-bg" onClick={() => setViendo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <ModalPago marca={marca} {...viendo} demo={demo} onCobrada={marcarCobrada} onClose={() => setViendo(null)} />
          </div>
        </div>
      )}
      {nuevo && (
        <div className="modal-bg" onClick={() => setNuevo(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <ModalNuevoCliente marca={marca} clientes={clientes} demo={demo} onClose={() => setNuevo(false)} onAdd={anadir} />
          </div>
        </div>
      )}
    </div>
  )
}

// Un pago ya facturado: sus datos, y marcarlo como cobrado.
function ModalPago({ marca, p, i, demo, onCobrada, onClose }: Sel & { marca: Marca; demo: boolean; onCobrada: () => Promise<string | null>; onClose: () => void }) {
  const pago = p.pagos[i]
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const d = desglose(p.precio / 2, p.pais === 'ES')
  const filas: [string, string][] = [
    ['Cliente', p.cliente],
    ['Concepto', conceptoPago(marca, p, i)],
    ['Emitida', pago.fecha ? fmtFecha(pago.fecha) : '—'],
    ['Fiscal', paisTxt(p.pais)],
  ]
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, fontSize: 16, fontWeight: 500 }}>
        <span className="mono">{pago.numero}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`pill ${pago.estado === 'cobrada' ? 'pill-green' : 'pill-amber'}`}>{pago.estado}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </span>
      </div>
      {filas.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, fontSize: 13, padding: '6px 0' }}>
          <span style={{ color: 'var(--text3)' }}>{k}</span><span>{v}</span>
        </div>
      ))}
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500, borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}>
        <span>A cobrar</span><span>{eur(d?.total ?? p.precio / 2)}</span>
      </div>
      {demo && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 14 }}>Demo: no se escribe nada.</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 14 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {pago.facturaId
          ? <a className="btn" href={`/invoice/${pago.facturaId}`} target="_blank" rel="noopener noreferrer">Ver factura</a>
          : <button className="btn" disabled title="En la demo no hay factura real" style={{ opacity: 0.5 }}>Ver factura</button>}
        {pago.estado === 'pendiente' && <button className="btn btn-primary" disabled={ocupado} style={{ flex: 1, justifyContent: 'center' }}
          onClick={async () => { setOcupado(true); const e = await onCobrada(); setOcupado(false); if (e) setError(e) }}>{ocupado ? 'Guardando…' : 'Marcar como cobrada'}</button>}
      </div>
    </>
  )
}

// Vista previa exacta de la factura que se va a crear, antes de confirmar.
function ModalFacturarPago({ marca, p, i, numero, demo, onConfirmar, onClose }: { marca: Marca; p: ProyectoAgencia; i: 0 | 1; numero: string; demo: boolean; onConfirmar: (n: string) => Promise<string | null>; onClose: () => void }) {
  // Igual que en la base de datos: el segundo pago se lleva el céntimo sobrante.
  const mitad = Math.round(p.precio * 50) / 100
  const base = i === 0 ? mitad : Math.round((p.precio - mitad) * 100) / 100
  const bloqueo = bloqueoFiscal(p)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const d = desglose(base, p.pais === 'ES')
  const filas: [string, string][] = [
    ['Número', demo ? numero : `${numero} (previsto)`],
    ['Cliente', p.cliente],
    ['Concepto', conceptoPago(marca, p, i)],
    ['Fecha', `${fmtFecha(hoy())} · vence a 30 días`],
    ['Fiscal', paisTxt(p.pais)],
    ['Marca', marca.key],
  ]
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, fontSize: 16, fontWeight: 500 }}>
        Facturar pago {i + 1} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      {filas.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, fontSize: 13, padding: '6px 0' }}>
          <span style={{ color: 'var(--text3)' }}>{k}</span><span className={k === 'Número' || k === 'Marca' ? 'mono' : ''}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
        {(d ? [['Base', d.base], ['IVA 21 %', d.iva], ['Retención 15 %', -d.ret]] : [['Base', base]]).map(([k, v]) => (
          <div key={k as string} className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text2)', padding: '3px 0' }}><span>{k}</span><span>{eur(v as number)}</span></div>
        ))}
        <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500, padding: '6px 0 0' }}><span>A cobrar</span><span>{eur(d?.total ?? base)}</span></div>
      </div>
      {demo && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 14 }}>Demo: al confirmar no se escribe nada.</div>}
      {!demo && !bloqueo && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 14 }}>Se crea de verdad como factura pendiente. El número definitivo lo asigna la base de datos.</div>}
      {bloqueo && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 14 }}>{bloqueo}</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 14 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!!bloqueo || ocupado} style={{ flex: 1, justifyContent: 'center', opacity: bloqueo ? 0.5 : 1 }}
          onClick={async () => { setOcupado(true); const e = await onConfirmar(numero); setOcupado(false); if (e) setError(e) }}>
          {ocupado ? 'Creando…' : `Crear factura${demo ? ` ${numero}` : ''}`}
        </button>
      </div>
    </>
  )
}

function ModalNuevoCliente({ marca, clientes, demo, onAdd, onClose }: { marca: Marca; clientes: Props['clientes']; demo: boolean; onAdd: (p: Omit<ProyectoAgencia, 'id'>) => Promise<string | null>; onClose: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [cliente, setCliente] = useState('')
  const [web, setWeb] = useState('')
  const [plan, setPlan] = useState('Essential')
  const [precio, setPrecio] = useState('')
  const fiscal = clientes.find(c => c.cliente === cliente)
  const [paisManual, setPaisManual] = useState<PaisFiscal | ''>('')
  const pais = (paisManual || fiscal?.pais || 'ES') as PaisFiscal
  const listo = cliente.trim() && web.trim() && Number(precio) > 0
  const input = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
  const label = { display: 'block' as const, fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nuevo cliente · {marca.nombre} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Cliente fiscal</label>
        <input list="clientes-fiscales-agencia" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre fiscal (de Clientes)" style={input} />
        <datalist id="clientes-fiscales-agencia">{clientes.map(c => <option key={c.cliente} value={c.cliente} />)}</datalist>
        {cliente && !fiscal && <div style={{ fontSize: 10.5, color: 'var(--amber)', marginTop: 4 }}>No está en Clientes: guarda sus datos fiscales antes de facturar (Facturación › Clientes).</div>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Web</label>
        <input value={web} onChange={e => setWeb(e.target.value.replace(/^https?:\/\//, ''))} placeholder="estudio.es" style={input} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div><label style={label}>Plan</label>
          <select value={plan} onChange={e => setPlan(e.target.value)} style={input}>{['Essential', 'Studio', 'Signature'].map(x => <option key={x}>{x}</option>)}</select></div>
        <div><label style={label}>Precio (base, sin IVA)</label>
          <input type="number" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="990" style={input} /></div>
      </div>
      {demo && <div style={{ marginBottom: 14 }}>
        <label style={label}>País fiscal</label>
        <select value={paisManual || pais} onChange={e => setPaisManual(e.target.value as PaisFiscal)} style={input}>
          <option value="ES">España · IVA 21 % − retención 15 %</option><option value="UE">UE · sin IVA</option><option value="EXT">Fuera de la UE · sin IVA</option>
        </select>
        {fiscal?.pais && !paisManual && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>Tomado de su ficha en Clientes.</div>}
      </div>}
      {!demo && fiscal?.pais && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>{PAIS_TXT[fiscal.pais]} (de su ficha en Clientes)</div>}
      {Number(precio) > 0 && <div className="mono" style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Dos pagos de {eur(Number(precio) / 2)} base · {eur(total(Number(precio) / 2, pais))} a cobrar cada uno</div>}
      {demo && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 6 }}>Demo: se añade solo en pantalla.</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!listo || ocupado} style={{ flex: 1, justifyContent: 'center', opacity: listo ? 1 : 0.5 }}
          onClick={async () => {
            if (!listo) return
            setOcupado(true)
            const e = await onAdd({ marca: marca.key, cliente: cliente.trim(), web: web.trim(), plan, precio: Number(precio), pais, pagos: [{ estado: 'sin_facturar' }, { estado: 'sin_facturar' }] })
            setOcupado(false); if (e) setError(e)
          }}>
          {ocupado ? 'Guardando…' : 'Añadir cliente'}
        </button>
      </div>
    </>
  )
}
