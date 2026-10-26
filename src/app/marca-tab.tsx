'use client'

import { useMemo, useState } from 'react'
import { desglose } from '@/lib/importes'
import { ETIQUETA_PAGO, siguienteNumero, type Marca, type PaisFiscal, type ProyectoAgencia } from '@/lib/marcas'

// Pestaña de una agencia (marca de precio cerrado): una fila por cliente con su web, el precio
// y los dos pagos. Cada «Facturar pago N» crea su propia factura (número correlativo, IVA y
// retención según el país) con crear_factura_pago() en la base de datos. En demo todo pasa en memoria.
// Con el € delante, como el resto del hub (mismas cifras y decimales que antes).
// El signo va delante del €: −€180,00.
const eur = (n: number) => (n < 0 ? '−' : '') + '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.abs(n))
// Sin céntimos cuando no hay (€990, no €990,00): la lista respira más.
const eurCorto = (n: number) => (n < 0 ? '−' : '') + '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.abs(n))
const PAIS_TXT: Record<PaisFiscal, string> = { ES: 'España · IVA 21 % − retención 15 %', UE: 'UE · sin IVA', EXT: 'Fuera de la UE · sin IVA' }
const paisTxt = (p: PaisFiscal | null) => p ? PAIS_TXT[p] : 'Sin datos fiscales'
const hoy = () => new Date().toISOString().slice(0, 10)
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
// Estado de cada pago con su punto: verde cobrado, ámbar pendiente, vacío sin facturar.
const PUNTO = { cobrada: 'dot--ok', pendiente: 'dot--wait', sin_facturar: 'dot--off' }
const VOZ = { cobrada: 'cobrado', pendiente: 'pendiente', sin_facturar: 'sin facturar' }
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

// Lo que paga el cliente por una base (con IVA y retención si es de España).
const total = (base: number, pais: PaisFiscal | null) => desglose(base, pais === 'ES')?.total ?? base
// Igual que crear_factura_pago() en la base de datos.
export const conceptoPago = (marca: Marca, p: ProyectoAgencia, i: 0 | 1) => [marca.nombre, ['Web', p.plan, p.web && `(${p.web})`].filter(Boolean).join(' '), ETIQUETA_PAGO[i]].join(' · ')
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
  abrir?: number | null                        // proyecto que llega desplegado (desde Overview)
}
type Sel = { p: ProyectoAgencia; i: 0 | 1 }

export default function MarcaTab({ marca, proyectos: iniciales, numerosExistentes, clientes, demo, acciones, abrir }: Props) {
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
    if (p.unica) {
      const x = total(p.unica.importe, p.pais)
      if (p.unica.estado === 'cobrada') t.cobrado += x; else t.pendiente += x
      return t
    }
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
  // Una fila por web que se despliega en sus dos pagos. Cobrado y por cobrar ya salen arriba, en las cifras de
  // la página de la marca (rediseño comercial, fase 4); aquí solo lo que falta por facturar.
  return (
    <div className="col">
      <section className="block" aria-label={`Webs de ${marca.nombre}`}>
        <p className="label caps">
          <span>Clientes · {new Set(proyectos.map(p => p.cliente)).size}</span><i className="rule" />
          {tot.porFacturar > 0 && <span className="label__m">Por facturar <span className="num">{eurCorto(Math.round(tot.porFacturar))}</span></span>}
          {demo && <span className="label__m aviso" title="Datos de ejemplo: no se escribe nada en la base de datos">Demo</span>}
          <button type="button" className="label__m copy" onClick={() => setNuevo(true)}>+ Cliente</button>
        </p>
        {aviso && <p className="nota">{aviso}</p>}
        {ordenados.length === 0 ? <p className="empty">Todavía no hay clientes en {marca.nombre}.</p> : (
          <ul className="projs focus">
            {ordenados.map(p => <FilaWeb key={p.id} p={p} abierta={p.id === abrir} onFacturar={i => setFacturando({ p, i })} onVer={i => setViendo({ p, i })} />)}
          </ul>
        )}
      </section>

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

// Una web: cliente, su dominio debajo (y el aviso si faltan datos fiscales), precio base y una barra
// de dos mitades, una por pago. Al desplegar, los dos pagos; cada uno abre su diálogo de siempre.
function FilaWeb({ p, abierta: inicial, onFacturar, onVer }: { p: ProyectoAgencia; abierta?: boolean; onFacturar: (i: 0 | 1) => void; onVer: (i: 0 | 1) => void }) {
  const [abierta, setAbierta] = useState(!!inicial)
  // El siguiente pago que se puede facturar (el segundo, solo después del primero).
  const facturable = p.unica ? -1 : p.pagos[0].estado === 'sin_facturar' ? 0 : p.pagos[1].estado === 'sin_facturar' ? 1 : -1
  const estadoTxt = p.unica ? `Factura única ${VOZ[p.unica.estado]}`
    : p.pagos.map((x, i) => `Pago ${i + 1} ${i === facturable ? 'por facturar' : VOZ[x.estado]}`).join(' · ')
  const mitades = p.unica ? [p.unica.estado] : p.pagos.map(x => x.estado)
  const esWeb = /^[^\s/]+\.[a-z]{2,}$/i.test(p.web)
  const pendientes = p.unica ? [] : ([0, 1] as const).filter(i => p.pagos[i].estado === 'pendiente')
  return (
    <li id={`proyecto-${p.id}`} className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--web" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="p__main">
          <span className="p__n">{p.cliente}</span>
          <span className="p__s caps">{p.web}{!p.pais && <> · <span className="aviso">Sin datos fiscales</span></>}</span>
        </span>
        <span className="p__v num" title="Precio base, sin IVA">{eurCorto(p.precio)}</span>
        <span className="half" title={estadoTxt}>
          {mitades.map((e, i) => <i key={i} className={`is-${e}${i === facturable ? ' is-facturar' : ''}`} />)}
          <span className="sr">{estadoTxt}</span>
        </span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          <ul className="dias">
            {p.unica ? (
              <li className="d">
                {(() => {
                  const u = p.unica
                  const contenido = <>
                    <span className="d__f caps">Única</span>
                    <span className="d__q">{u.numero} · {u.estado} · factura única</span>
                    <span className="num">{eurCorto(total(u.importe, p.pais))}</span>
                    <span className="d__st" title={u.estado}><i className={`dot ${PUNTO[u.estado]}`} aria-hidden="true" /><span className="sr">{u.estado}</span></span>
                  </>
                  return u.facturaId
                    ? <a className="d__btn" href={`/invoice/${u.facturaId}`} target="_blank" rel="noopener noreferrer" title="Ver factura">{contenido}</a>
                    : <span className="d__fila">{contenido}</span>
                })()}
              </li>
            ) : ([0, 1] as const).map(i => {
              const pago = p.pagos[i]
              const bloqueado = i === 1 && p.pagos[0].estado === 'sin_facturar'
              const facturada = pago.estado !== 'sin_facturar'
              return (
                <li key={i} className="d">
                  <button type="button" className="d__btn" disabled={bloqueado} onClick={() => facturada ? onVer(i) : onFacturar(i)}>
                    <span className="d__f caps">Pago {i + 1}</span>
                    <span className="d__q">{i ? 'Al publicar' : 'Al empezar'} · {facturada ? `${pago.numero} · ${pago.estado}` : bloqueado ? 'tras el primer pago' : 'Facturar →'}</span>
                    <span className={`num${facturada ? '' : ' dim'}`}>{eurCorto(total(p.precio / 2, p.pais))}</span>
                    <span className="d__st" title={VOZ[pago.estado]}><i className={`dot ${PUNTO[pago.estado]}`} aria-hidden="true" /><span className="sr">{VOZ[pago.estado]}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="p__foot">
            <span className="caps dim">
              {[p.plan && `Plan ${p.plan}`, paisTxt(p.pais)].filter(Boolean).join(' · ')}
              {esWeb && <> · <a className="copy" href={`https://${p.web}`} target="_blank" rel="noopener noreferrer">{p.web} ↗</a></>}
            </span>
            <span className="foot__r">
              {pendientes.map(i => <button key={i} type="button" className="ghost" onClick={() => onVer(i)}>Marcar pago {i + 1} cobrado</button>)}
              {facturable >= 0 && <button type="button" className="pill pill--sm" onClick={() => onFacturar(facturable as 0 | 1)}>Facturar pago {facturable + 1}</button>}
            </span>
          </div>
        </div>
      )}
    </li>
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
  // Campos en lista, sin cajas; el total, tras la única línea.
  return (
    <>
      <div className="modal__head">
        <h2 className="mono">{pago.numero}</h2>
        <span className="modal__estado caps"><i className={`dot ${PUNTO[pago.estado]}`} aria-hidden="true" />{pago.estado}<button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></span>
      </div>
      <dl className="meta meta--modal">
        {filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <dl className="desg">
        <div className="desg__t"><dt>A cobrar</dt><dd className="num">{eur(d?.total ?? p.precio / 2)}</dd></div>
      </dl>
      {demo && <p className="nota aviso modal__nota">Demo: no se escribe nada.</p>}
      {error && <p className="nota error modal__nota">{error}</p>}
      <div className="modal__foot">
        {pago.facturaId
          ? <a className="copy caps" href={`/invoice/${pago.facturaId}`} target="_blank" rel="noopener noreferrer">Ver factura →</a>
          : <button type="button" className="copy caps" disabled title="En la demo no hay factura real">Ver factura</button>}
        {pago.estado === 'pendiente' && <button type="button" className="pill pill--sm" disabled={ocupado}
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
      <div className="modal__head"><h2>Facturar pago {i + 1}</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
      <dl className="meta meta--modal">
        {filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Número' || k === 'Marca' ? 'mono' : ''}>{v}</dd></div>)}
      </dl>
      <dl className="desg">
        {(d ? [['Base', d.base], ['IVA 21 %', d.iva], ['Retención 15 %', -d.ret]] : [['Base', base]]).map(([k, v]) => (
          <div key={k as string}><dt>{k}</dt><dd className="num">{eur(v as number)}</dd></div>
        ))}
        <div className="desg__t"><dt>A cobrar</dt><dd className="num">{eur(d?.total ?? base)}</dd></div>
      </dl>
      {demo && <p className="nota aviso modal__nota">Demo: al confirmar no se escribe nada.</p>}
      {!demo && !bloqueo && <p className="nota modal__nota">Se crea de verdad como factura pendiente. El número definitivo lo asigna la base de datos.</p>}
      {bloqueo && <p className="nota aviso modal__nota">{bloqueo}</p>}
      {error && <p className="nota error modal__nota">{error}</p>}
      <div className="modal__foot">
        <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={!!bloqueo || ocupado}
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
  const [plan, setPlan] = useState(marca.key === 'arkevo' ? 'Essential' : '')
  const [precio, setPrecio] = useState('')
  const fiscal = clientes.find(c => c.cliente === cliente)
  const [paisManual, setPaisManual] = useState<PaisFiscal | ''>('')
  const pais = (paisManual || fiscal?.pais || 'ES') as PaisFiscal
  const listo = cliente.trim() && web.trim() && Number(precio) > 0
  return (
    <>
      <div className="modal__head"><h2>Nuevo cliente · {marca.nombre}</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
      <div className="modal__campos">
        <div className="field">
          <label className="caps" htmlFor="nc-cliente">Cliente fiscal</label>
          <input id="nc-cliente" list="clientes-fiscales-agencia" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre fiscal (de Clientes)" />
          <datalist id="clientes-fiscales-agencia">{clientes.map(c => <option key={c.cliente} value={c.cliente} />)}</datalist>
          {cliente && !fiscal && <p className="nota aviso field__nota">No está en Clientes: guarda sus datos fiscales antes de facturar (Facturación › Clientes).</p>}
        </div>
        <div className="field">
          <label className="caps" htmlFor="nc-web">Web</label>
          <input id="nc-web" value={web} onChange={e => setWeb(e.target.value.replace(/^https?:\/\//, ''))} placeholder="estudio.es" />
        </div>
        <div className="modal__par">
          <div className="field">
            <label className="caps" htmlFor="nc-plan">Plan</label>
            <input id="nc-plan" list={`planes-${marca.key}`} value={plan} onChange={e => setPlan(e.target.value)} placeholder="Opcional" />
            {marca.key === 'arkevo' && <datalist id={`planes-${marca.key}`}>{['Essential', 'Studio', 'Signature'].map(x => <option key={x} value={x} />)}</datalist>}
            {marca.key === 'cartela' && <datalist id={`planes-${marca.key}`}>{['Carta', 'Casa', 'Grupo'].map(x => <option key={x} value={x} />)}</datalist>}
          </div>
          <div className="field">
            <label className="caps" htmlFor="nc-precio">Precio (base, sin IVA)</label>
            <input id="nc-precio" type="number" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="990" />
          </div>
        </div>
        {demo && <div className="field">
          <label className="caps" htmlFor="nc-pais">País fiscal</label>
          <select id="nc-pais" value={paisManual || pais} onChange={e => setPaisManual(e.target.value as PaisFiscal)}>
            <option value="ES">España · IVA 21 % − retención 15 %</option><option value="UE">UE · sin IVA</option><option value="EXT">Fuera de la UE · sin IVA</option>
          </select>
          <Chevron />
          {fiscal?.pais && !paisManual && <p className="nota field__nota">Tomado de su ficha en Clientes.</p>}
        </div>}
      </div>
      {!demo && fiscal?.pais && <p className="nota modal__nota">{PAIS_TXT[fiscal.pais]} (de su ficha en Clientes)</p>}
      {Number(precio) > 0 && <p className="nota mono modal__nota">Dos pagos de {eur(Number(precio) / 2)} base · {eur(total(Number(precio) / 2, pais))} a cobrar cada uno</p>}
      {demo && <p className="nota aviso modal__nota">Demo: se añade solo en pantalla.</p>}
      {error && <p className="nota error modal__nota">{error}</p>}
      <div className="modal__foot">
        <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={!listo || ocupado}
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
