'use client'

// Finanzas › Reparto: cada cobro del banco en una fila con su reparto en
// cascada (src/lib/reparto.ts) y un ✓ por destino; debajo, las huchas
// (sub-ahorros ficticios dentro de cada cuenta) y los ajustes del reparto.
// La propuesta se recalcula sola hasta el primer ✓, que la guarda en
// `repartos` / `reparto_lineas`. Un ✓ que entra en una cuenta reparte su %
// automático a las huchas de esa cuenta (`huchas_movimientos`).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, batchQuery, type Compra, type Cuenta, type Factura, type PresupuestoItem } from '@/lib/supabase'
import { calcular, type Reales } from '@/lib/impuestos'
import { cuotaAutonomo } from '@/lib/autonomo'
import {
  repartir, aportesAuto, asignadoPorHucha, parseResto, esCuotaAutonomo, mesSiguiente, nombreMes,
  type Cobro, type Hucha, type HuchaMov, type Linea, type ParteResto,
} from '@/lib/reparto'

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...agrupar }).format(n)
const fecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const mesLargo = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Por debajo de esto, un ingreso sin factura no entra en el reparto.
const MIN_INGRESO = 20

type Mov = { id: string; fecha: string; importe: number; contraparte: string | null; concepto: string | null; cuenta_uid: string }
type Rep = { id: number; movimiento_id: string | null; fecha: string; importe: number; concepto: string | null }
type FilaLinea = Linea & { id: number; reparto_id: number }

// Color de cada destino en la barra y los botones: impuestos ámbar,
// regularización rojo, la reserva del mes siguiente en grises azulados y el
// resto con el color de su cuenta (el mismo punto que en Huchas y Patrimonio).
const COLOR: Partial<Record<Linea['destino'], string>> = {
  impuestos: 'var(--amber)', regularizacion: 'var(--red)',
  autonomo: '#9AA3B5', fijos: '#7C8799', variables: '#5E6A7D',
}
const COLOR_CRYPTO = '#8A8A87'

export default function RepartoTab({ cuentas, facturas, compras, fijos, variables, cuotaReal, reales, reload }: {
  cuentas: Cuenta[]; facturas: Factura[]; compras: Compra[]
  fijos: PresupuestoItem[]; variables: PresupuestoItem[]
  cuotaReal: number; reales: Reales; reload: () => void
}) {
  const [movs, setMovs] = useState<Mov[]>([])
  const [uidCuenta, setUidCuenta] = useState<Record<string, number | null>>({})
  const [reps, setReps] = useState<Rep[]>([])
  const [lineas, setLineas] = useState<FilaLinea[]>([])
  const [huchas, setHuchas] = useState<Hucha[]>([])
  const [hmovs, setHmovs] = useState<HuchaMov[]>([])
  const [resto, setResto] = useState<ParteResto[]>([])
  const [desde, setDesde] = useState('2026-11-01')
  const [excluidos, setExcluidos] = useState<string[]>([])
  const [verQuitados, setVerQuitados] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    // Cobros (enlazados a factura) e ingresos sin factura: todo lo que entra de fuera.
    const [m, mi, bc, r, l, h, hm, cfg] = await batchQuery([
      supabase.from('movimientos').select('id,fecha,importe,contraparte,concepto,cuenta_uid').eq('clase', 'cobro').order('fecha', { ascending: false }).limit(300),
      supabase.from('movimientos').select('id,fecha,importe,contraparte,concepto,cuenta_uid').eq('clase', 'ingreso').order('fecha', { ascending: false }).limit(300),
      supabase.from('bancos_cuentas').select('uid,cuenta_id'),
      supabase.from('repartos').select('*').order('fecha', { ascending: false }),
      supabase.from('reparto_lineas').select('*').order('orden'),
      supabase.from('huchas').select('*').order('orden'),
      supabase.from('huchas_movimientos').select('*').order('fecha', { ascending: false }),
      supabase.from('configuracion').select('clave,valor'),
    ])
    const err = [m, mi, bc, r, l, h, hm, cfg].find(x => x.error)?.error
    if (err) setError(err.message)
    // Los ingresos pequeños (bonificaciones, comisiones devueltas) no se reparten.
    if (m.data || mi.data) setMovs([...(m.data || []), ...(mi.data || []).filter((x: Mov) => Number(x.importe) >= MIN_INGRESO)])
    if (bc.data) setUidCuenta(Object.fromEntries(bc.data.map((x: { uid: string; cuenta_id: number | null }) => [x.uid, x.cuenta_id])))
    if (r.data) setReps(r.data)
    if (l.data) setLineas(l.data)
    if (h.data) setHuchas(h.data)
    if (hm.data) setHmovs(hm.data)
    if (cfg.data) {
      const v = (k: string) => (cfg.data as { clave: string; valor: string }[]).find(x => x.clave === k)?.valor
      setResto(parseResto(v('reparto_resto')))
      if (v('reparto_desde')) setDesde(v('reparto_desde')!)
      try { const x = JSON.parse(v('reparto_excluidos') || '[]'); setExcluidos(Array.isArray(x) ? x : []) } catch { setExcluidos([]) }
    }
    setCargado(true)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const hoy = hoyISO()
  const fiscales = useMemo(() => facturas.filter(f => f.fiscal !== false), [facturas])
  const autonomo = useMemo(() => cuotaAutonomo(fiscales, compras, cuotaReal, hoy), [fiscales, compras, cuotaReal, hoy])

  // El 130 va sobre el rendimiento (ingresos − gastos − cuota − 5 %), no sobre la base: factor del año.
  const factorIrpf = useMemo(() => {
    const anio = Number(hoy.slice(0, 4)), q = Math.ceil(Number(hoy.slice(5, 7)) / 3)
    const t = calcular(anio, fiscales, compras, cuotaReal, reales)[q - 1]
    const ingresos = fiscales.filter(f => f.fecha.startsWith(String(anio)) && f.fecha <= hoy).reduce((s, f) => s + Number(f.importe), 0)
    return ingresos > 0 ? Math.min(1, Math.max(0, t.rendimientoAcum / ingresos)) : 1
  }, [fiscales, compras, cuotaReal, reales, hoy])

  const huchaReg = huchas.find(h => h.clave === 'regularizacion_autonomo' && !h.archivada) || null
  const asignado = useMemo(() => asignadoPorHucha(hmovs), [hmovs])

  // Cobros: los del banco desde `reparto_desde` (solo los que llegan a una cuenta del hub)
  // y los repartos guardados cuyo movimiento ya no existe.
  const cobros: Cobro[] = useMemo(() => {
    const porMov = new Map(reps.filter(r => r.movimiento_id).map(r => [r.movimiento_id!, r]))
    const deRep = (r: Rep) => lineas.filter(l => l.reparto_id === r.id).sort((a, b) => a.orden - b.orden)
    const lista: Cobro[] = movs
      .filter(m => m.fecha >= desde && Number(m.importe) > 0 && uidCuenta[m.cuenta_uid] && !excluidos.includes(m.id))
      .map(m => {
        const r = porMov.get(m.id)
        return {
          movimiento_id: m.id, fecha: m.fecha, importe: Number(m.importe),
          concepto: m.contraparte || m.concepto || 'Cobro',
          facturas: facturas.filter(f => f.movimiento_id === m.id && f.fiscal !== false),
          ...(r ? { reparto_id: r.id, lineas: deRep(r) } : {}),
        }
      })
    const ids = new Set(movs.map(m => m.id))
    for (const r of reps) if (!r.movimiento_id || !ids.has(r.movimiento_id))
      if (r.fecha >= desde) lista.push({ movimiento_id: r.movimiento_id, fecha: r.fecha, importe: Number(r.importe), concepto: r.concepto || 'Cobro', facturas: [], reparto_id: r.id, lineas: deRep(r) })
    return lista
  }, [movs, reps, lineas, facturas, uidCuenta, desde, excluidos])

  const propuesta = useMemo(() => repartir(cobros, {
    cuentas,
    fijosMes: fijos.filter(f => !esCuotaAutonomo(f.nombre)).reduce((t, f) => t + Number(f.limite), 0),
    variablesMes: variables.reduce((t, v) => t + Number(v.limite), 0),
    cuotaReal, cuotaTramo: autonomo.tramo.cuota, factorIrpf, resto, huchaRegularizacion: huchaReg,
  }), [cobros, cuentas, fijos, variables, cuotaReal, autonomo.tramo.cuota, factorIrpf, resto, huchaReg])


  // Lo que hay que tener el día 1 del mes siguiente en la operativa.
  const fijosSinCuota = fijos.filter(f => !esCuotaAutonomo(f.nombre)).reduce((t, f) => t + Number(f.limite), 0)
  const variablesMes = variables.reduce((t, v) => t + Number(v.limite), 0)
  const objetivoReserva = cuotaReal + fijosSinCuota + variablesMes

  const filas = [...cobros].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const meses = Array.from(new Set(filas.map(c => c.fecha.slice(0, 7))))
  const mesActual = hoy.slice(0, 7)
  const cobradoMes = filas.filter(c => c.fecha.startsWith(mesActual)).reduce((t, c) => t + c.importe, 0)
  const porMover = filas.flatMap(c => propuesta.get(c) || []).filter(l => !l.hecho).reduce((t, l) => t + Number(l.importe), 0)

  // Primer ✓ de un cobro: guarda la propuesta tal cual se ve.
  async function congelar(c: Cobro): Promise<FilaLinea[]> {
    if (c.reparto_id && c.lineas) return c.lineas as FilaLinea[]
    const { data: rep, error: e1 } = await supabase.from('repartos').insert({ movimiento_id: c.movimiento_id, fecha: c.fecha, importe: c.importe, concepto: c.concepto }).select('*').single()
    if (e1 || !rep) throw new Error(e1?.message || 'No se pudo guardar el reparto')
    const filas = (propuesta.get(c) || []).map(l => ({ reparto_id: rep.id, destino: l.destino, etiqueta: l.etiqueta, cuenta_id: l.cuenta_id, hucha_id: l.hucha_id, importe: l.importe, orden: l.orden }))
    if (!filas.length) return []
    const { data, error: e2 } = await supabase.from('reparto_lineas').insert(filas).select('*')
    if (e2 || !data) throw new Error(e2?.message || 'No se pudieron guardar las líneas')
    return data
  }

  async function marcar(c: Cobro, orden: number | 'todo', hecho: boolean) {
    setOcupado(true); setError(null)
    try {
      const ls = await congelar(c)
      const objetivo = ls.filter(l => (orden === 'todo' || l.orden === orden) && !!l.hecho !== hecho)
      for (const l of objetivo) {
        const { error: e } = await supabase.from('reparto_lineas').update({ hecho, hecho_en: hecho ? new Date().toISOString() : null }).eq('id', l.id)
        if (e) throw new Error(e.message)
        if (hecho) {
          const aportes = aportesAuto(l, huchas).map(a => ({ ...a, fecha: c.fecha, motivo: `${l.etiqueta} · ${c.concepto}`, reparto_linea_id: l.id }))
          if (aportes.length) { const { error: e3 } = await supabase.from('huchas_movimientos').insert(aportes); if (e3) throw new Error(e3.message) }
        } else {
          await supabase.from('huchas_movimientos').delete().eq('reparto_linea_id', l.id)
        }
      }
      await cargar(); reload()
    } catch (e) { setError((e as Error).message) }
    setOcupado(false)
  }

  // «Quitar»: un ingreso que no es dinero que repartir (devolución de una compra,
  // dinero de un amigo…) sale del reparto. Lista en `configuracion.reparto_excluidos`.
  async function excluir(c: Cobro) {
    if (!c.movimiento_id || c.reparto_id) return
    if (!confirm(`¿Quitar «${c.concepto}» (€${fmt2(c.importe)}) del reparto? No es un cobro que repartir.`)) return
    setOcupado(true)
    const lista = Array.from(new Set([...excluidos, c.movimiento_id]))
    const { error: e } = await supabase.from('configuracion').upsert({ clave: 'reparto_excluidos', valor: JSON.stringify(lista) })
    if (e) setError(e.message); else setExcluidos(lista)
    setOcupado(false)
  }

  async function devolver(id: string) {
    setOcupado(true)
    const lista = excluidos.filter(x => x !== id)
    const { error: e } = await supabase.from('configuracion').upsert({ clave: 'reparto_excluidos', valor: JSON.stringify(lista) })
    if (e) setError(e.message); else setExcluidos(lista)
    setOcupado(false)
  }

  // Vuelve a la propuesta calculada (borra lo guardado y lo que llevó a las huchas).
  async function recalcular(c: Cobro) {
    if (!c.reparto_id) return
    const hechos = (c.lineas || []).filter(l => l.hecho).length
    if (!confirm(hechos ? `Este reparto tiene ${hechos} traspaso${hechos === 1 ? '' : 's'} marcado${hechos === 1 ? '' : 's'}. ¿Borrarlo y recalcular? Lo que llevó a las huchas se quita.` : '¿Recalcular este reparto con los datos de hoy?')) return
    setOcupado(true)
    const { error: e } = await supabase.from('repartos').delete().eq('id', c.reparto_id)
    if (e) setError(e.message)
    await cargar(); reload(); setOcupado(false)
  }

  const colorDe = (l: Linea) => COLOR[l.destino] || (l.cuenta_id ? cuentas.find(x => x.id === l.cuenta_id)?.color : null) || COLOR_CRYPTO
  // Nombre corto del botón: la reserva lleva el mes al que va.
  const nombreDe = (l: Linea, c: Cobro) => {
    const mes = nombreMes(mesSiguiente(c.fecha)).slice(0, 3)
    return l.destino === 'autonomo' ? `Cuota ${mes}` : l.destino === 'fijos' ? `Fijos ${mes}` : l.destino === 'variables' ? `Variables ${mes}` : l.etiqueta
  }
  const ayuda = (l: Linea) => `${l.etiqueta}${l.detalle ? ` · ${l.detalle}` : ''}${l.cuenta_id ? ` → ${cuentas.find(x => x.id === l.cuenta_id)?.nombre}` : ''}`

  return (
    <div className="col rp">
      <section className="fx__kpis" aria-label="Resumen del reparto">
        <div className="fx__kpi"><span className="fx__l">Cobrado este mes</span><span className="fx__v">€{fmt(cobradoMes)}</span><span className="fx__s">{filas.filter(c => c.fecha.startsWith(mesActual)).length} cobros</span></div>
        <div className="fx__kpi"><span className="fx__l">Por mover</span><span className="fx__v">€{fmt(porMover)}</span><span className={`fx__s${porMover >= 1 ? ' aviso' : ''}`}>{porMover >= 1 ? 'traspasos sin ✓' : 'todo repartido'}</span></div>
        <div className="fx__kpi"><span className="fx__l">Cuota de autónomo</span><span className="fx__v">€{fmt(autonomo.tramo.cuota)} <small>/ mes</small></span><span className={`fx__s${autonomo.diferencia >= 1 ? ' aviso' : ''}`}>tramo {autonomo.tramo.n} · pagas €{fmt(cuotaReal)}</span></div>
        <div className="fx__kpi"><span className="fx__l">Regularización</span><span className="fx__v">€{fmt(huchaReg ? asignado[huchaReg.id] || 0 : 0)}</span><span className="fx__s">apartado · estimada €{fmt(autonomo.regularizacionAnio)} en {hoy.slice(0, 4)}</span></div>
      </section>

      {error && <p className="nota error">{error}</p>}

      <section className="fx__card" aria-labelledby="rp-cobros">
        <header><h2 id="rp-cobros">Cobros</h2><span className="caps dim">toca un destino cuando hayas hecho el traspaso</span></header>
        {!cargado ? <p className="nota">Cargando…</p> : filas.length === 0 ? <p className="nota">Sin cobros desde el {fecha(desde)}.</p> : meses.map(mes => {
          const del = filas.filter(c => c.fecha.startsWith(mes))
          const reservado = Math.min(objetivoReserva, del.flatMap(c => propuesta.get(c) || []).filter(l => l.destino === 'autonomo' || l.destino === 'fijos' || l.destino === 'variables').reduce((t, l) => t + Number(l.importe), 0))
          const pctReserva = objetivoReserva > 0 ? reservado / objetivoReserva * 100 : 100
          const sig = nombreMes(mesSiguiente(mes))
          return (
            <div key={mes} className="rp__mes">
              <div className="rp__mesh">
                <h3>{mesLargo(mes).replace(/ de \d{4}$/, '')}<span className="dim"> · €{fmt(del.reduce((t, c) => t + c.importe, 0))}</span></h3>
                <div className="rp__res" title={`Cuota €${fmt(cuotaReal)} + fijos €${fmt(fijosSinCuota)} + variables €${fmt(variablesMes)}`}>
                  <span className="dim">Reserva de {sig}</span>
                  <span className="rp__meter"><i style={{ width: `${pctReserva}%` }} /></span>
                  <b className={pctReserva >= 100 ? 'ok' : ''}>{pctReserva >= 100 ? 'Cubierta ✓' : `€${fmt(reservado)} / €${fmt(objetivoReserva)}`}</b>
                </div>
              </div>
              {del.map(c => {
                const ls = propuesta.get(c) || []
                const hechos = ls.filter(l => l.hecho).length
                const todo = ls.length > 0 && hechos === ls.length
                return (
                  <article key={c.movimiento_id || `r${c.reparto_id}`} className={`rp__cob${todo ? ' ok' : ''}`}>
                    <header className="rp__cobh">
                      <div className="rp__quien">
                        <b>{c.concepto}</b>
                        <small className="dim">{fecha(c.fecha)} · {c.facturas.length ? c.facturas.map(f => f.numero).join(', ') : 'sin factura'}</small>
                      </div>
                      <div className="rp__cuanto">
                        <b className="num">€{fmt2(c.importe)}</b>
                        <small className={todo ? 'ok' : 'dim'}>{todo ? 'Repartido ✓' : `${hechos} de ${ls.length} hechos`}</small>
                      </div>
                    </header>
                    <div className="rp__bar" role="img" aria-label={ls.map(l => `${nombreDe(l, c)} €${fmt(l.importe)}`).join(', ')}>
                      {ls.map(l => <i key={l.orden} className={l.hecho ? 'on' : ''} style={{ flex: Number(l.importe), background: colorDe(l) }} title={`${nombreDe(l, c)} · €${fmt2(l.importe)}`} />)}
                    </div>
                    <div className="rp__chips">
                      {ls.map(l => (
                        <button key={l.orden} type="button" className={`rp__chip${l.hecho ? ' on' : ''}`} disabled={ocupado}
                          onClick={() => marcar(c, l.orden, !l.hecho)} title={ayuda(l)} aria-pressed={!!l.hecho}
                          style={{ '--c': colorDe(l) } as React.CSSProperties}>
                          <i aria-hidden>{l.hecho ? '✓' : ''}</i><span>{nombreDe(l, c)}</span><b className="num">€{fmt(l.importe)}</b>
                        </button>
                      ))}
                    </div>
                    <footer className="rp__cobf">
                      {!todo && <button type="button" className="pill pill--sm" disabled={ocupado} onClick={() => marcar(c, 'todo', true)}>✓ Todo hecho</button>}
                      <span className="rp__mas">
                        {c.reparto_id && <button type="button" className="copy caps" disabled={ocupado} onClick={() => recalcular(c)}>Recalcular</button>}
                        {!c.reparto_id && c.movimiento_id && c.facturas.length === 0 && <button type="button" className="copy caps" disabled={ocupado} onClick={() => excluir(c)} title="No es un cobro: sacarlo del reparto">No es un cobro</button>}
                      </span>
                    </footer>
                  </article>
                )
              })}
            </div>
          )
        })}

        {(() => {
          const quitados = movs.filter(m => excluidos.includes(m.id) && m.fecha >= desde)
          if (!quitados.length) return null
          return (
            <div className="rp__fuera">
              <button type="button" className="copy" onClick={() => setVerQuitados(!verQuitados)}>
                {quitados.length} movimiento{quitados.length === 1 ? '' : 's'} fuera del reparto {verQuitados ? '−' : '+'}
              </button>
              {verQuitados && (
                <ul>
                  {quitados.map(m => (
                    <li key={m.id}>
                      <span className="dim">{fecha(m.fecha)}</span>
                      <span>{m.contraparte || m.concepto || 'Movimiento'}</span>
                      <b className="num">€{fmt2(Number(m.importe))}</b>
                      <button type="button" className="copy caps" disabled={ocupado} onClick={() => devolver(m.id)}>Devolver</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}

        <details className="rp__como">
          <summary>¿Cómo se reparte cada cobro?</summary>
          <ol>
            <li><i style={{ background: COLOR.impuestos }} /><b>Impuestos</b><span>IRPF ({Math.round(20 * factorIrpf)} % efectivo) y el IVA si el cliente es de España → hucha de impuestos</span></li>
            <li><i style={{ background: COLOR.regularizacion }} /><b>Regularización</b><span>hasta €{fmt(autonomo.diferencia)} al mes: tu tramo (€{fmt(autonomo.tramo.cuota)}) menos lo que pagas (€{fmt(cuotaReal)}) → BBVA Ahorros</span></li>
            <li><i style={{ background: COLOR.fijos }} /><b>Reserva del mes siguiente</b><span>cuota €{fmt(cuotaReal)} + fijos €{fmt(fijosSinCuota)} + variables €{fmt(variablesMes)}: se queda en BBVA; el día 1 pasas los variables a Revolut</span></li>
            <li><i style={{ background: 'var(--green)' }} /><b>El resto</b><span>{resto.filter(p => p.pct > 0).map(p => `${Math.round(p.pct)} % ${p.destino === 'crypto' ? 'crypto' : cuentas.find(c => c.id === p.cuenta_id)?.nombre || ''}`).join(' · ')}</span></li>
          </ol>
          <p className="dim">Cada paso solo pide lo que falta: si un cobro anterior ya cubrió la reserva, el siguiente va directo al resto. Al marcar el primer destino, el reparto de ese cobro queda guardado.</p>
        </details>
      </section>

      <Huchas cuentas={cuentas} huchas={huchas} asignado={asignado} hmovs={hmovs} recargar={async () => { await cargar(); reload() }} />

      <Ajustes cuentas={cuentas} resto={resto} desde={desde} autonomo={autonomo} cuotaReal={cuotaReal}
        guardado={async () => { await cargar() }} />
    </div>
  )
}

// ——— Huchas ———————————————————————————————————————————————————————————————

type FormHucha = { id?: number; cuenta_id: number; nombre: string; meta: string; fecha_meta: string; pct_auto: string }

function Huchas({ cuentas, huchas, asignado, hmovs, recargar }: {
  cuentas: Cuenta[]; huchas: Hucha[]; asignado: Record<number, number>; hmovs: HuchaMov[]; recargar: () => Promise<void>
}) {
  const [form, setForm] = useState<FormHucha | null>(null)
  const [mover, setMover] = useState<{ hucha: Hucha; signo: 1 | -1; importe: string } | null>(null)
  const [verMovs, setVerMovs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const raiz = cuentas.filter(c => !c.padre_id || c.tipo === 'irpf')
  const activas = huchas.filter(h => !h.archivada)
  // Cuentas que se enseñan: las de ahorro e inversión y cualquiera con huchas.
  const visibles = raiz.filter(c => ['ahorro', 'inversion'].includes(c.tipo) || activas.some(h => h.cuenta_id === c.id))

  async function guardar() {
    if (!form || !form.nombre.trim()) return
    setError(null)
    const fila = { cuenta_id: form.cuenta_id, nombre: form.nombre.trim(), meta: form.meta ? Number(form.meta) : null, fecha_meta: form.fecha_meta || null, pct_auto: Number(form.pct_auto) || 0 }
    const pctCuenta = activas.filter(h => h.cuenta_id === form.cuenta_id && h.id !== form.id).reduce((t, h) => t + Number(h.pct_auto), 0) + fila.pct_auto
    if (pctCuenta > 100) { setError(`Las huchas de esta cuenta sumarían un ${pctCuenta} % automático (máximo 100 %).`); return }
    const { error: e } = form.id
      ? await supabase.from('huchas').update(fila).eq('id', form.id)
      : await supabase.from('huchas').insert({ ...fila, orden: activas.filter(h => h.cuenta_id === form.cuenta_id).length + 1 })
    if (e) { setError(e.message); return }
    setForm(null); await recargar()
  }

  async function moverDinero() {
    if (!mover) return
    const n = Number(mover.importe.replace(',', '.'))
    if (!(n > 0)) return
    const { error: e } = await supabase.from('huchas_movimientos').insert({ hucha_id: mover.hucha.id, importe: mover.signo * n, motivo: mover.signo > 0 ? 'Asignado a mano' : 'Sacado / gastado' })
    if (e) { setError(e.message); return }
    setMover(null); await recargar()
  }

  async function archivar(h: Hucha) {
    const a = asignado[h.id] || 0
    if (!confirm(a ? `«${h.nombre}» tiene €${fmt(a)} asignados. Al archivarla vuelven a «sin asignar». ¿Seguir?` : `¿Archivar «${h.nombre}»?`)) return
    const { error: e } = await supabase.from('huchas').update({ archivada: true }).eq('id', h.id)
    if (e) setError(e.message); else await recargar()
  }

  return (
    <section className="fx__card" aria-labelledby="rp-huchas">
      <header>
        <h2 id="rp-huchas">Huchas</h2>
        <button type="button" className="copy caps" onClick={() => setForm({ cuenta_id: visibles[0]?.id || raiz[0]?.id, nombre: '', meta: '', fecha_meta: '', pct_auto: '0' })}>+ Nueva hucha</button>
      </header>
      {error && <p className="nota error">{error}</p>}

      {form && (
        <div className="rp__form">
          <label><span className="caps dim">Cuenta</span>
            <select value={form.cuenta_id} onChange={e => setForm({ ...form, cuenta_id: Number(e.target.value) })} disabled={!!form.id}>
              {raiz.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label><span className="caps dim">Nombre</span><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="iPhone, viaje…" autoFocus /></label>
          <label><span className="caps dim">Meta · €</span><input type="number" inputMode="decimal" value={form.meta} onChange={e => setForm({ ...form, meta: e.target.value })} placeholder="opcional" /></label>
          <label><span className="caps dim">Para el</span><input type="date" value={form.fecha_meta} onChange={e => setForm({ ...form, fecha_meta: e.target.value })} /></label>
          <label><span className="caps dim">% de cada aporte</span><input type="number" inputMode="decimal" min={0} max={100} value={form.pct_auto} onChange={e => setForm({ ...form, pct_auto: e.target.value })} /></label>
          <div className="rp__fb"><button type="button" className="pill pill--sm" onClick={guardar}>Guardar</button><button type="button" className="ghost" onClick={() => setForm(null)}>Cancelar</button></div>
        </div>
      )}

      <div className="rp__cuentas">
        {visibles.map(c => {
          const hs = activas.filter(h => h.cuenta_id === c.id)
          const saldo = Number(c.saldo)
          const total = hs.reduce((t, h) => t + (asignado[h.id] || 0), 0)
          const libre = saldo - total
          return (
            <div key={c.id} className="rp__cuenta">
              <div className="rp__ch"><span><i style={{ background: c.color || 'var(--muted)' }} />{c.nombre}</span><b className="num">{c.moneda === 'USD' ? '$' : '€'}{fmt(saldo)}</b></div>
              {hs.length === 0 && <p className="nota">Sin huchas.</p>}
              {hs.map(h => {
                const a = asignado[h.id] || 0
                const pct = h.meta ? Math.min(100, Math.max(0, a / Number(h.meta) * 100)) : null
                const falta = h.meta ? Math.max(0, Number(h.meta) - a) : 0
                const meses = h.fecha_meta ? Math.max(1, Math.ceil((new Date(h.fecha_meta + 'T00:00:00').getTime() - Date.now()) / (30.44 * 864e5))) : null
                return (
                  <div key={h.id} className="rp__h">
                    <div className="rp__hl">
                      <span className="rp__hn">{h.nombre}{Number(h.pct_auto) > 0 && <small className="caps dim"> · {fmt(Number(h.pct_auto))} % auto</small>}</span>
                      <span className="num">€{fmt(a)}{h.meta ? <span className="dim"> / €{fmt(Number(h.meta))}</span> : null}</span>
                    </div>
                    {pct !== null && <span className="fx__meter"><i style={{ width: `${pct}%` }} /></span>}
                    <div className="rp__hs">
                      <small className="dim">
                        {h.meta ? (falta > 0 ? `faltan €${fmt(falta)}${meses ? ` · €${fmt(falta / meses)}/mes hasta el ${fecha(h.fecha_meta!)}` : ''}` : 'meta cumplida') : h.clave ? 'diferencia de la cuota, se llena sola' : 'sin meta'}
                      </small>
                      <span className="rp__ha">
                        <button type="button" className="copy caps" onClick={() => setMover({ hucha: h, signo: 1, importe: '' })}>+ Asignar</button>
                        <button type="button" className="copy caps" onClick={() => setMover({ hucha: h, signo: -1, importe: '' })}>− Sacar</button>
                        <button type="button" className="copy caps" onClick={() => setVerMovs(verMovs === h.id ? null : h.id)}>Historial</button>
                        <button type="button" className="copy caps" onClick={() => setForm({ id: h.id, cuenta_id: h.cuenta_id, nombre: h.nombre, meta: h.meta != null ? String(h.meta) : '', fecha_meta: h.fecha_meta || '', pct_auto: String(h.pct_auto) })}>Editar</button>
                        {!h.clave && <button type="button" className="copy caps" onClick={() => archivar(h)}>Archivar</button>}
                      </span>
                    </div>
                    {mover?.hucha.id === h.id && (
                      <div className="rp__mv">
                        <input type="number" inputMode="decimal" autoFocus value={mover.importe} placeholder="€" onChange={e => setMover({ ...mover, importe: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') moverDinero() }} />
                        <button type="button" className="pill pill--sm" onClick={moverDinero}>{mover.signo > 0 ? 'Asignar' : 'Sacar'}</button>
                        <button type="button" className="ghost" onClick={() => setMover(null)}>Cancelar</button>
                        {mover.signo > 0 && <small className="dim">libre en {c.nombre}: €{fmt(libre)}</small>}
                      </div>
                    )}
                    {verMovs === h.id && (
                      <ul className="rp__hist">
                        {hmovs.filter(m => m.hucha_id === h.id).slice(0, 12).map(m => (
                          <li key={m.id}><span className="dim">{fecha(m.fecha)}</span><span>{m.motivo || '—'}</span><span className="num">{Number(m.importe) >= 0 ? '+' : '−'}€{fmt2(Math.abs(Number(m.importe)))}</span></li>
                        ))}
                        {!hmovs.some(m => m.hucha_id === h.id) && <li className="dim">Sin movimientos.</li>}
                      </ul>
                    )}
                  </div>
                )
              })}
              <div className={`rp__libre${libre < 0 ? ' aviso' : ''}`}>
                <span>Sin asignar</span><b className="num">€{fmt(libre)}</b>
              </div>
              {libre < 0 && <p className="nota aviso">Las huchas suman más que el saldo de {c.nombre}: faltan €{fmt(-libre)}.</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ——— Ajustes del reparto —————————————————————————————————————————————————

function Ajustes({ cuentas, resto, desde, autonomo, cuotaReal, guardado }: {
  cuentas: Cuenta[]; resto: ParteResto[]; desde: string; cuotaReal: number
  autonomo: ReturnType<typeof cuotaAutonomo>; guardado: () => Promise<void>
}) {
  const [partes, setPartes] = useState<ParteResto[]>(resto)
  const [inicio, setInicio] = useState(desde)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { setPartes(resto) }, [resto])
  useEffect(() => { setInicio(desde) }, [desde])
  const suma = partes.reduce((t, p) => t + (Number(p.pct) || 0), 0)
  const opciones = cuentas.filter(c => !c.padre_id)
  const valorDe = (p: ParteResto) => p.destino === 'crypto' ? 'crypto' : String(p.cuenta_id ?? '')

  async function guardar() {
    const limpio = partes.filter(p => Number(p.pct) > 0).map(p => p.destino === 'crypto' ? { destino: 'crypto' as const, pct: Number(p.pct) } : { cuenta_id: Number(p.cuenta_id), pct: Number(p.pct) })
    const { error: e } = await supabase.from('configuracion').upsert([
      { clave: 'reparto_resto', valor: JSON.stringify(limpio) },
      { clave: 'reparto_desde', valor: inicio },
    ])
    setMsg(e ? e.message : 'Guardado')
    if (!e) await guardado()
  }

  return (
    <section className="fx__card" aria-labelledby="rp-ajustes">
      <header><h2 id="rp-ajustes">Ajustes del reparto</h2><span className="caps dim">el resto, tras impuestos y gastos del mes</span></header>
      <div className="rp__aj">
        {partes.map((p, i) => (
          <div key={i} className="rp__parte">
            <select value={valorDe(p)} onChange={e => { const v = e.target.value; setPartes(partes.map((x, j) => j === i ? (v === 'crypto' ? { destino: 'crypto', pct: x.pct } : { cuenta_id: Number(v), pct: x.pct }) : x)) }}>
              {opciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value="crypto">Crypto</option>
            </select>
            <input type="number" inputMode="decimal" min={0} max={100} value={p.pct} onChange={e => setPartes(partes.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x))} aria-label="Porcentaje" />
            <span className="dim">%</span>
            <button type="button" className="copy caps" onClick={() => setPartes(partes.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        <div className="rp__parte">
          <button type="button" className="copy caps" onClick={() => setPartes([...partes, { cuenta_id: opciones[0]?.id, pct: 0 }])}>+ Destino</button>
          <span className={suma === 100 ? 'dim' : 'aviso'}>Suman {fmt(suma)} %{suma !== 100 ? ' · se repartirá en proporción' : ''}</span>
        </div>
        <label className="rp__parte"><span className="caps dim">Empezar en los cobros del</span><input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
        <div className="rp__parte"><button type="button" className="pill pill--sm" onClick={guardar}>Guardar ajustes</button>{msg && <span className="dim">{msg}</span>}</div>
      </div>
      <p className="nota rp__ley">
        Autónomo: rendimiento neto de €{fmt(autonomo.mensual)}/mes en {autonomo.meses.toFixed(1).replace('.', ',')} meses (base €{fmt(autonomo.ingresos)} − gastos €{fmt(autonomo.gastos)} − 7 %) → tramo {autonomo.tramo.n} ({autonomo.tramo.desde ? `€${fmt(autonomo.tramo.desde)}–` : 'hasta '}{Number.isFinite(autonomo.tramo.hasta) ? `€${fmt(autonomo.tramo.hasta)}` : 'más'}), base €{fmt2(autonomo.tramo.base)} × 31,5 % = €{fmt2(autonomo.tramo.cuota)}. Pagas €{fmt(cuotaReal)} (Impuestos › Cuota). Cuando subas la base en Import@ss, cambia allí la cuota y la regularización deja de crecer.
      </p>
    </section>
  )
}
