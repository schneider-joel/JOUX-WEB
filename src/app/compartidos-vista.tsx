'use client'

import { useCallback, useEffect, useState } from 'react'
import { deudaDe, saldo, type GastoCompartido, type Persona } from '@/lib/compartidos'

// Importes como en el resto del hub: «€1.100,50», con punto de miles siempre
const eur = (n: number) => (n < 0 ? '−' : '') + '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.abs(n))
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const mesDe = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
const CATEGORIAS = ['Alquiler', 'Agua', 'Luz', 'Supermercado', 'Casa', 'Salidas', 'Viajes', 'Otros']

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
const IconMas = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

type Datos = { quien: Persona; pareja: string; gastos: GastoCompartido[]; token?: string }
type Borrador = { tipo: 'gasto' | 'liquidacion'; fecha: string; concepto: string; importe: string; pagador: Persona; para: Persona[]; categoria: string }

// Vista de la cuenta compartida. La usan el hub (Joel, con su cookie) y el
// link privado de la pareja (con su token).
export default function CompartidosVista({ token }: { token?: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/compartidos${qs}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ error: 'Sin conexión' }))
    if (r.error) setError(r.error); else setDatos(r)
  }, [qs])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="empty">{error === 'No autorizado' ? 'Este link no es válido.' : error}</p>
  if (!datos) return <p className="empty">Cargando…</p>

  const yo = datos.quien
  const otro: Persona = yo === 'joel' ? 'pareja' : 'joel'
  const nombre = (p: Persona) => (p === yo ? 'Tú' : p === 'joel' ? 'Joel' : datos.pareja)
  const sujeto = (p: Persona) => (p === yo ? 'tú' : nombre(p))
  const paraQuien = (p: Persona) => (p === yo ? 'ti' : nombre(p))
  const elOtroDe = (p: Persona): Persona => (p === 'joel' ? 'pareja' : 'joel')
  const nombreOtro = nombre(otro)
  // Saldo desde quien mira: positivo = el otro te debe.
  const s = saldo(datos.gastos) * (yo === 'joel' ? 1 : -1)
  const efecto = (g: GastoCompartido) => (g.pagador === yo ? 1 : -1) * (g.tipo === 'liquidacion' ? Number(g.importe) : deudaDe(g))

  const nuevoGasto = () => setBorrador({ tipo: 'gasto', fecha: hoy(), concepto: '', importe: '', pagador: yo, para: ['joel', 'pareja'], categoria: '' })
  const saldar = () => setBorrador({ tipo: 'liquidacion', fecha: hoy(), concepto: `Saldo de cuentas`, importe: Math.abs(s).toFixed(2), pagador: s > 0 ? otro : yo, para: ['joel', 'pareja'], categoria: '' })
  // "Dividir entre": los dos = a medias; solo quien no pagó = entero para esa
  // persona; solo quien pagó no genera deuda (no hace falta apuntarlo).
  const repartoDe = (b: Borrador): 'mitad' | 'otro' | null =>
    b.para.length === 2 ? 'mitad' : b.para.length === 1 && b.para[0] !== b.pagador ? 'otro' : null

  const guardar = async () => {
    if (!borrador) return
    setGuardando(true)
    const r = await fetch('/api/compartidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...borrador, reparto: repartoDe(borrador) || 'mitad', token }) }).then(r => r.json())
    setGuardando(false)
    if (r.error) { alert(r.error); return }
    setBorrador(null)
    cargar()
  }
  const borrar = async (g: GastoCompartido) => {
    if (!confirm(`¿Borrar "${g.concepto}" (${eur(Number(g.importe))})?`)) return
    const r = await fetch(`/api/compartidos?id=${g.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`, { method: 'DELETE' }).then(r => r.json())
    if (r.error) alert(r.error); else cargar()
  }
  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/c/${datos.token}`).catch(() => {})
    setCopiado(true); setTimeout(() => setCopiado(false), 1800)
  }

  const porMes = new Map<string, GastoCompartido[]>()
  for (const g of datos.gastos) porMes.set(g.fecha.slice(0, 7), [...(porMes.get(g.fecha.slice(0, 7)) || []), g])

  const paz = Math.abs(s) < 0.01
  const esGasto = borrador?.tipo === 'gasto'

  // Campos de una sola línea y botones de la web (mismo estado, mismos cálculos y mismo guardado que antes).
  return (
    <div className="col">
      {/* El saldo manda; el link de la pareja, en la etiqueta */}
      <section className="block" aria-label="Saldo">
        <p className="label caps"><span>Casona</span><i className="rule" />
          {datos.token && <button type="button" className="label__m copy caps hit" onClick={copiarLink}>{copiado ? 'Link copiado ✓' : `Copiar link para ${datos.pareja}`}</button>}
        </p>
        <div className="hero">
          <div className="bal">
            <p className="bal__k caps"><i className={`dot ${paz ? 'dot--off' : s > 0 ? 'dot--green' : 'dot--wait'}`} aria-hidden="true" />{paz ? 'Estáis en paz' : s > 0 ? `${nombreOtro} te debe` : `Le debes a ${nombreOtro}`}</p>
            <p className="big">{eur(Math.abs(s))}</p>
          </div>
          <div className="bal__acts">
            <button type="button" className="pill" onClick={nuevoGasto}><IconMas />Añadir gasto</button>
            {!paz && <button type="button" className="ghost" onClick={saldar}>Saldar cuenta</button>}
          </div>
        </div>
      </section>

      {borrador && (
        <section className="block" aria-label={borrador.tipo === 'liquidacion' ? 'Saldar cuenta' : 'Nuevo gasto'}>
          <p className="label caps"><span>{borrador.tipo === 'liquidacion' ? 'Saldar cuenta' : 'Nuevo gasto'}</span><i className="rule" /></p>
          <div className="gf">
            <div className={`gf__grid${esGasto ? '' : ' gf__grid--liq'}`}>
              {esGasto && (
                <div className="field gf__con">
                  <label className="caps" htmlFor="g-con">Concepto</label>
                  <input id="g-con" value={borrador.concepto} onChange={e => setBorrador({ ...borrador, concepto: e.target.value })} placeholder="Ej: Compra Mercadona" />
                </div>
              )}
              <div className="field">
                <label className="caps" htmlFor="g-imp">Importe €</label>
                <input id="g-imp" type="number" inputMode="decimal" step="0.01" value={borrador.importe} onChange={e => setBorrador({ ...borrador, importe: e.target.value })} placeholder="0,00" autoFocus />
              </div>
              <div className="field">
                <label className="caps" htmlFor="g-fecha">Fecha</label>
                <input id="g-fecha" type="date" value={borrador.fecha} onChange={e => setBorrador({ ...borrador, fecha: e.target.value })} />
              </div>
              {esGasto && (
                <div className="field gf__cat">
                  <label className="caps" htmlFor="g-cat">Categoría · opcional</label>
                  <select id="g-cat" value={borrador.categoria} onChange={e => setBorrador({ ...borrador, categoria: e.target.value })}>
                    <option value="">—</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Chevron />
                </div>
              )}
            </div>
            <div className="gf__chips">
              <fieldset className="chips">
                <legend className="caps">{borrador.tipo === 'liquidacion' ? 'Quién transfiere' : 'Quién pagó'}</legend>
                <div className="chips__row">
                  {([yo, otro] as Persona[]).map(p => (
                    <label key={p} className="chip">
                      <input type="radio" name="pagador" value={p} checked={borrador.pagador === p} onChange={e => setBorrador({ ...borrador, pagador: e.target.value as Persona })} />
                      <span>{p === yo ? 'Tú' : nombreOtro}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {esGasto && (
                <fieldset className="chips gf__para">
                  <legend className="caps">Dividir entre</legend>
                  <ul className="gf__lista">
                    {([yo, otro] as Persona[]).map(p => {
                      const marcado = borrador.para.includes(p)
                      const parte = marcado && Number(borrador.importe) > 0 ? Number(borrador.importe) / borrador.para.length : 0
                      return (
                        <li key={p}>
                          <label className="check">
                            <input type="checkbox" checked={marcado}
                              onChange={e => setBorrador({ ...borrador, para: e.target.checked ? Array.from(new Set([...borrador.para, p])) : borrador.para.filter(x => x !== p) })} />
                            <span className={marcado ? 'gf__n is-on' : 'gf__n'}>{p === yo ? `${p === 'joel' ? 'Joel' : datos.pareja} (tú)` : nombreOtro}</span>
                          </label>
                          <span className={`num${marcado ? '' : ' dim'}`}>{eur(parte)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              )}
            </div>
            {esGasto && !repartoDe(borrador) && (
              <p className="nota aviso">
                {borrador.para.length === 0 ? 'Elige al menos una persona.' : 'Si el gasto es solo de quien lo pagó, no genera deuda: no hace falta apuntarlo.'}
              </p>
            )}
            {Number(borrador.importe) > 0 && (borrador.tipo === 'liquidacion' || repartoDe(borrador)) && (
              <p className="gf__prev">
                {borrador.tipo === 'liquidacion'
                  ? `${borrador.pagador === yo ? 'Tú le pasas' : `${nombreOtro} te pasa`} ${eur(Number(borrador.importe))}.`
                  : `${borrador.pagador === yo ? `${nombreOtro} te debe` : `Le debes a ${nombreOtro}`} ${eur(repartoDe(borrador) === 'otro' ? Number(borrador.importe) : Number(borrador.importe) / 2)} por este gasto.`}
              </p>
            )}
            <div className="gf__foot">
              <button type="button" className="copy caps" onClick={() => setBorrador(null)}>Cancelar</button>
              <button type="button" className="pill pill--sm" disabled={guardando || !(Number(borrador.importe) > 0) || (borrador.tipo === 'gasto' && (!borrador.concepto.trim() || !repartoDe(borrador)))} onClick={guardar}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Un bloque por mes; cada gasto, una fila que se despliega en su detalle (y borrar) */}
      {datos.gastos.length === 0 ? (
        <section className="block" aria-label="Movimientos">
          <p className="label caps"><span>Movimientos</span><i className="rule" /></p>
          <p className="empty">Todavía no hay gastos. {yo === 'joel' ? 'Tus pagos del alquiler y el agua' : 'Los pagos del alquiler y el agua de Joel'} se añaden solos desde el banco.</p>
        </section>
      ) : Array.from(porMes.entries()).map(([mes, gs]) => (
        <section key={mes} className="block" aria-label={mesDe(gs[0].fecha)}>
          <p className="label caps"><span>{mesDe(gs[0].fecha)}</span><i className="rule" /></p>
          <ul className="projs focus">
            {gs.map(g => {
              const e = efecto(g)
              const puedeBorrar = yo === 'joel' || g.creado_por === yo
              const liq = g.tipo === 'liquidacion'
              const quien = liq ? `${nombre(g.pagador)} → ${paraQuien(elOtroDe(g.pagador))}` : `Pagó ${sujeto(g.pagador)}`
              const detalle = liq
                ? `${quien} · ${eur(Number(g.importe))}${g.movimiento_id ? ' · del banco' : ''}`
                : `Pagó ${sujeto(g.pagador)} ${eur(Number(g.importe))} · ${g.reparto === 'mitad' ? 'a medias' : `todo para ${paraQuien(elOtroDe(g.pagador))}`}${g.movimiento_id ? ' · del banco' : ''}`
              return (
                <FilaGasto key={g.id} concepto={g.concepto} sub={`${fechaCorta(g.fecha)} · ${quien}`} detalle={detalle} efecto={e}
                  liq={liq} banco={!!g.movimiento_id} onBorrar={puedeBorrar ? () => borrar(g) : undefined} />
              )
            })}
          </ul>
        </section>
      ))}

      <p className="nota">Verde: te lo deben a ti. Ámbar: lo debes tú.</p>
    </div>
  )
}

// Un gasto: concepto, fecha y quién pagó, lo que deja en la cuenta y un punto si vino del banco; al desplegar, su detalle y borrar
function FilaGasto({ concepto, sub, detalle, efecto: e, liq, banco, onBorrar }: { concepto: string, sub: string, detalle: string, efecto: number, liq: boolean, banco: boolean, onBorrar?: () => void }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <li className={`p${liq ? ' is-liq' : ''}${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--g" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="p__main"><span className="g__t">{concepto}</span><span className="p__s caps">{sub}</span></span>
        <span className={`p__v num ${e > 0 ? 'up' : 'aviso'}`}>{e > 0 ? '+' : '−'}{eur(Math.abs(e))}</span>
        <span className="st" title={banco ? 'Del banco' : undefined}>{banco && <><i className="dot dot--ok" aria-hidden="true" /><span className="sr">Del banco</span></>}</span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body g__body">
          <p className="g__d">{detalle}</p>
          {onBorrar && <div className="p__foot"><button type="button" className="copy caps borrar" onClick={onBorrar}>Borrar</button></div>}
        </div>
      )}
    </li>
  )
}
