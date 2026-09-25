'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ComprasTab from './compras-tab'
import ImpuestosTab from './impuestos-tab'
import { supabase, batchQuery, Compra, Cuenta, Crypto, Factura, PresupuestoItem, Proyecto, DiaTrabajado, TipoProyecto, PatrimonioSnapshot, ClienteFiscal } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const fmtMes = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
const barColor = (pct: number) => pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4ade80'
const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ultimosMeses = (n: number) => {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

type Tab = 'dashboard' | 'facturas' | 'compras' | 'impuestos' | 'presupuesto' | 'timesheet_ab' | 'timesheet_propios' | 'clientes' | 'regularizacion'
type Modal = { type: string; data?: any } | null

const svgProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
const Icon = {
  home: () => <svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  invoice: () => <svg {...svgProps}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></svg>,
  clock: () => <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  users: () => <svg {...svgProps}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4a3.5 3.5 0 0 1 0 7" /><path d="M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></svg>,
  check: () => <svg {...svgProps}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  x: () => <svg {...svgProps}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  refresh: () => <svg {...svgProps}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>,
  wallet: () => <svg {...svgProps}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z" /><circle cx="16.5" cy="14.5" r="1" /></svg>,
  coin: () => <svg {...svgProps}><path d="M12 3l6 9-6 9-6-9z" /><path d="M6 12h12" /></svg>,
  trend: () => <svg {...svgProps}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
  spark: () => <svg {...svgProps}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" /></svg>,
  edit: () => <svg {...svgProps}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></svg>,
  plus: () => <svg {...svgProps}><path d="M12 5v14M5 12h14" /></svg>,
  link: () => <svg {...svgProps}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></svg>,
  card: () => <svg {...svgProps}><rect x="2.5" y="5" width="19" height="14" rx="2.2" /><path d="M2.5 9.5h19" /><path d="M6 14h5" /></svg>,
}

function useChartSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 200 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth || 600, h: el.clientHeight || 200 })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

function PatrimonioChart({ snapshots, actual }: { snapshots: PatrimonioSnapshot[], actual: number }) {
  const { ref, w: W, h: H } = useChartSize()
  const meses = ultimosMeses(12)
  const mesActual = meses[meses.length - 1]
  const porMes = new Map<string, number>()
  for (const s of [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha))) porMes.set(s.fecha.slice(0, 7), Number(s.total))
  porMes.set(mesActual, actual)
  const puntos = meses.map((m, i) => ({ m, i, v: porMes.get(m) })).filter(p => p.v !== undefined) as { m: string, i: number, v: number }[]

  const padL = 44, padR = 12, padT = 14, padB = 26
  const vals = puntos.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || Math.max(max * 0.1, 1)
  const lo = min - span * 0.25, hi = max + span * 0.25
  const x = (i: number) => padL + (i / (meses.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const path = puntos.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')
  const area = puntos.length > 1 ? `${path} L${x(puntos[puntos.length - 1].i)},${H - padB} L${x(puntos[0].i)},${H - padB} Z` : ''
  const ticks = [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8]
  const tickLabel = (t: number) => (hi - lo) < 6000 ? `${(t / 1000).toFixed(1)}k` : `${fmt(t / 1000)}k`
  const last = puntos[puntos.length - 1]

  return (
    <div className="chart-wrap" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <defs>
          <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={padL - 8} y={y(t) + 3} fontSize="9" fill="var(--text3)" textAnchor="end" fontFamily="JetBrains Mono, monospace">{tickLabel(t)}</text>
          </g>
        ))}
        {meses.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} fontSize="9" fill={m === mesActual ? 'var(--text2)' : 'var(--text3)'} textAnchor="middle" fontFamily="Inter, sans-serif">{fmtMes(m)}</text>
        ))}
        {area && <path d={area} fill="url(#pgrad)" />}
        {puntos.length > 1 && <path d={path} fill="none" stroke="#fb923c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {puntos.map(p => (
          <circle key={p.m} cx={x(p.i)} cy={y(p.v)} r={p === last ? 4 : 2.5} fill={p === last ? '#fb923c' : '#0a0908'} stroke="#fb923c" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
        {last && (
          <g>
            <line x1={x(last.i)} x2={x(last.i)} y1={y(last.v)} y2={H - padB} stroke="#fb923c" strokeOpacity="0.35" strokeDasharray="2 3" />
            <rect x={Math.min(x(last.i) - 34, W - padR - 68)} y={y(last.v) - 26} width="68" height="18" rx="5" fill="#1b1917" stroke="var(--border2)" />
            <text x={Math.min(x(last.i), W - padR - 34)} y={y(last.v) - 14} fontSize="10" fill="var(--text)" textAnchor="middle" fontFamily="JetBrains Mono, monospace">€{fmt(last.v)}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

function IngresosChart({ facturas }: { facturas: Factura[] }) {
  const { ref, w: W, h: H } = useChartSize()
  const meses = ultimosMeses(9)
  const datos = meses.map(m => {
    const fs = facturas.filter(f => f.fecha.slice(0, 7) === m)
    return { m, cobrado: fs.filter(f => f.estado === 'cobrada').reduce((s, f) => s + f.importe, 0), pendiente: fs.filter(f => f.estado === 'pendiente').reduce((s, f) => s + f.importe, 0) }
  })
  const max = Math.max(...datos.map(d => d.cobrado + d.pendiente), 1)
  const padL = 36, padR = 6, padT = 14, padB = 26
  const bw = (W - padL - padR) / meses.length
  const h = (v: number) => (v / max) * (H - padT - padB)
  const ticks = [0.25, 0.5, 0.75, 1].map(t => t * max)
  return (
    <div className="chart-wrap" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={H - padB - h(t)} y2={H - padB - h(t)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={padL - 8} y={H - padB - h(t) + 3} fontSize="9" fill="var(--text3)" textAnchor="end" fontFamily="JetBrains Mono, monospace">{fmt(t / 1000)}k</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = padL + bw * i + bw / 2
          const w = Math.min(bw * 0.5, 28)
          const hc = h(d.cobrado), hp = h(d.pendiente)
          return (
            <g key={d.m}>
              {hc > 0 && <rect x={cx - w / 2} y={H - padB - hc} width={w} height={hc} rx="3" fill="#f97316" />}
              {hp > 0 && <rect x={cx - w / 2} y={H - padB - hc - hp} width={w} height={hp} rx="3" fill="#fbbf24" fillOpacity="0.55" />}
              {d.cobrado + d.pendiente > 0 && (
                <text x={cx} y={H - padB - hc - hp - 5} fontSize="9" fill="var(--text2)" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{((d.cobrado + d.pendiente) / 1000).toFixed(1)}k</text>
              )}
              <text x={cx} y={H - 8} fontSize="9" fill="var(--text3)" textAnchor="middle" fontFamily="Inter, sans-serif">{fmtMes(d.m)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [modal, setModal] = useState<Modal>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [crypto, setCrypto] = useState<Crypto[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [fijos, setFijos] = useState<PresupuestoItem[]>([])
  const [variables, setVariables] = useState<PresupuestoItem[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [dias, setDias] = useState<DiaTrabajado[]>([])
  const [clientesFiscales, setClientesFiscales] = useState<ClienteFiscal[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [cuotaAutonomo, setCuotaAutonomo] = useState(0)
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([])
  const [ethPrice, setEthPrice] = useState<number>(2100)
  const [usdToEur, setUsdToEur] = useState<number>(0.92)
  const [mesActual, setMesActual] = useState('2026-09')
  const [presupuestoTotal, setPresupuestoTotal] = useState(1800)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const loadData = useCallback(async () => {
    const [c, cr, f, fi, v, cfg, pr, di, sn, cf, co] = await batchQuery([
      supabase.from('cuentas').select('*').order('orden'),
      supabase.from('crypto').select('*'),
      supabase.from('facturas').select('*').order('fecha'),
      supabase.from('presupuesto_fijos').select('*'),
      supabase.from('presupuesto_variables').select('*'),
      supabase.from('configuracion').select('*'),
      supabase.from('proyectos').select('*').order('created_at'),
      supabase.from('dias_trabajados').select('*').order('fecha'),
      supabase.from('patrimonio_snapshots').select('*').order('fecha'),
      supabase.from('clientes_fiscales').select('*').order('cliente'),
      supabase.from('compras').select('*').order('fecha'),
    ])
    if (c.data) setCuentas(c.data)
    if (cr.data) setCrypto(cr.data)
    if (f.data) setFacturas(f.data)
    if (fi.data) setFijos(fi.data)
    if (v.data) setVariables(v.data)
    if (pr.data) setProyectos(pr.data)
    if (di.data) setDias(di.data)
    if (sn.data) setSnapshots(sn.data)
    if (cf.data) setClientesFiscales(cf.data)
    if (co.data) setCompras(co.data)
    if (cfg.data) {
      const mes = cfg.data.find((x: any) => x.clave === 'mes_actual')?.valor
      const pt = cfg.data.find((x: any) => x.clave === 'presupuesto_total')?.valor
      const cuota = cfg.data.find((x: any) => x.clave === 'cuota_autonomo_mensual')?.valor
      if (cuota) setCuotaAutonomo(Number(cuota))
      if (mes) setMesActual(mes)
      if (pt) setPresupuestoTotal(Number(pt))
    }
    setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur')
      .then(r => r.json())
      .then(d => { const p = d?.ethereum?.eur; if (p) setEthPrice(p) })
      .catch(() => {})
    fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR')
      .then(r => r.json())
      .then(d => { const r2 = d?.rates?.EUR; if (r2) setUsdToEur(r2) })
      .catch(() => {})
  }, [])

  const aEuros = (c: Cuenta) => c.moneda === 'USD' ? c.saldo * usdToEur : c.saldo
  const totalLiquidez = cuentas.reduce((s, c) => s + aEuros(c), 0)
  const totalCrypto = crypto.reduce((s, c) => c.symbol === 'ETH' ? s + c.cantidad * ethPrice : s, 0)
  const totalPatrimonio = totalLiquidez + totalCrypto
  // Una factura ligada a un proyecto solo debería verse/cobrarse una vez que
  // el proyecto está "Facturado" — si volvió a Activo/Completado, se oculta
  // (el trigger de Supabase ya la borra si sigue pendiente; esto es red de
  // seguridad por si la UI todavía no recargó).
  const facturaVisible = (f: Factura) => {
    // Las de regularización (cobros viejos facturados a posteriori) viven en
    // su propia pestaña y no cuentan en pendientes/cobradas del día a día.
    if (f.origen === 'regularizacion') return false
    if (!f.proyecto_id) return true
    const p = proyectos.find(p => p.id === f.proyecto_id)
    return !p || p.status === 'facturado'
  }
  const facturasVisibles = facturas.filter(facturaVisible)
  const facturasPendientes = facturasVisibles.filter(f => f.estado === 'pendiente')
  const facturasCobradas = facturasVisibles.filter(f => f.estado === 'cobrada')
  const totalPendiente = facturasPendientes.reduce((s, f) => s + f.importe, 0)

  const mesActualKey = hoyLocal().slice(0, 7)
  const snapshotMesAnterior = [...snapshots].filter(s => s.fecha.slice(0, 7) < mesActualKey).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const deltaMes = snapshotMesAnterior ? totalPatrimonio - Number(snapshotMesAnterior.total) : null
  const deltaPct = snapshotMesAnterior && Number(snapshotMesAnterior.total) > 0 ? (deltaMes! / Number(snapshotMesAnterior.total)) * 100 : null

  useEffect(() => {
    if (loading || cuentas.length === 0) return
    const fecha = hoyLocal()
    const fila = { fecha, total: Math.round(totalPatrimonio * 100) / 100, liquidez: Math.round(totalLiquidez * 100) / 100, crypto: Math.round(totalCrypto * 100) / 100 }
    supabase.from('patrimonio_snapshots').upsert(fila).then(({ error }) => {
      if (!error) setSnapshots(prev => [...prev.filter(s => s.fecha !== fecha), fila])
    })
  }, [loading, cuentas.length, totalPatrimonio, totalLiquidez, totalCrypto])

  const marcarCobrada = async (factura: Factura) => {
    const { error } = await supabase
      .from('facturas')
      .update({ estado: 'cobrada', fecha_cobro: new Date().toISOString().split('T')[0], cuenta_destino_id: factura.cuenta_destino_id || cuentas.find(c => c.tipo === 'operativa')?.id })
      .eq('id', factura.id)
    if (!error) loadData()
  }

  const deleteFactura = async (id: number) => {
    await supabase.from('facturas').delete().eq('id', id)
    loadData()
  }

  const saveClienteFiscal = async (c: ClienteFiscal) => {
    await supabase.from('clientes_fiscales').upsert(c)
    setModal(null)
    loadData()
  }

  const deleteClienteFiscal = async (cliente: string) => {
    if (!confirm(`¿Borrar los datos fiscales de "${cliente}"? Las facturas ya cargadas no se ven afectadas.`)) return
    await supabase.from('clientes_fiscales').delete().eq('cliente', cliente)
    loadData()
  }


  const addFactura = async (data: any) => {
    await supabase.from('facturas').insert([{ ...data, estado: 'pendiente', origen: 'manual' }])
    setModal(null)
    loadData()
  }


  const updateCuentaSaldo = async (id: number, saldo: number) => {
    await supabase.from('cuentas').update({ saldo }).eq('id', id)
    loadData()
  }

  const addGasto = async (tabla: string, id: number, importe: number) => {
    const items = tabla === 'fijos' ? fijos : variables
    const item = items.find(i => i.id === id)
    if (!item) return
    await supabase.from(tabla === 'fijos' ? 'presupuesto_fijos' : 'presupuesto_variables')
      .update({ gastado: item.gastado + importe }).eq('id', id)
    setModal(null)
    loadData()
  }

  const editLimite = async (tabla: string, id: number, limite: number) => {
    await supabase.from(tabla === 'fijos' ? 'presupuesto_fijos' : 'presupuesto_variables')
      .update({ limite }).eq('id', id)
    setModal(null)
    loadData()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)', gap: 10, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }} />
      Cargando...
    </div>
  )

  const navItems: { id: Tab; label: string; icon: () => JSX.Element }[] = [
    { id: 'dashboard', label: 'Overview', icon: Icon.home },
    { id: 'facturas', label: 'Facturas', icon: Icon.invoice },
    { id: 'compras', label: 'Compras', icon: Icon.wallet },
    { id: 'impuestos', label: 'Impuestos', icon: Icon.trend },
    { id: 'clientes', label: 'Clientes', icon: Icon.card },
    { id: 'timesheet_ab', label: 'Timesheet AB', icon: Icon.clock },
    { id: 'timesheet_propios', label: 'Propios', icon: Icon.users },
    { id: 'regularizacion', label: 'Regularización', icon: Icon.refresh },
  ]
  const titulos: Record<Tab, [string, string]> = {
    dashboard: ['Overview', 'Patrimonio, cuentas y facturación'],
    facturas: ['Facturas', `${facturasPendientes.length} pendientes · €${fmt(totalPendiente)} por cobrar`],
    presupuesto: ['Presupuesto', 'Gastos del mes'],
    clientes: ['Clientes', `${clientesFiscales.length} con datos fiscales guardados`],
    timesheet_ab: ['Timesheet · Ambushed / BoldMove', 'Horas por proyecto y facturación'],
    timesheet_propios: ['Timesheet · Clientes propios', 'Días por proyecto y facturación'],
    compras: ['Compras', 'Facturas de gastos y compras'],
    impuestos: ['Impuestos', 'Estimación trimestral de IRPF (130) e IVA (303)'],
    regularizacion: ['Regularización de facturas', 'Temporal · cobros de ago 2024 – abr 2025 facturados a posteriori'],
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-name">JOUX Hub</div>
            <div className="brand-sub">Finanzas</div>
          </div>
        </div>
        {navItems.map(n => (
          <button key={n.id} className={`nav-btn${tab === n.id ? ' active' : ''}`} onClick={() => setTab(n.id)}>
            <n.icon /><span>{n.label}</span>
          </button>
        ))}
        <div className="nav-foot">{lastUpdated && `sync ${lastUpdated}`}</div>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <h1 className="page-title">{titulos[tab][0]}</h1>
            <div className="page-sub">{titulos[tab][1]}</div>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={() => loadData()}><Icon.refresh />Actualizar</button>
            {tab === 'clientes' ? (
              <button className="btn btn-primary" onClick={() => setModal({ type: 'editCliente' })}><Icon.plus />Nuevo cliente</button>
            ) : tab === 'compras' || tab === 'impuestos' ? null : (
              <button className="btn btn-primary" onClick={() => setModal({ type: 'addFactura' })}><Icon.plus />Nueva factura</button>
            )}
          </div>
        </header>

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <>
            <div className="stat-grid">
              <div className="card stat-card stat-card-primary">
                <div className="stat-icon"><Icon.spark /></div>
                <div className="stat-label">Patrimonio total</div>
                <div className="stat-value">€{fmt(totalPatrimonio)}</div>
                {deltaMes !== null ? (
                  <div className={`stat-delta ${deltaMes > 0 ? 'up' : deltaMes < 0 ? 'down' : 'flat'}`}>
                    {deltaMes > 0 ? '▲' : deltaMes < 0 ? '▼' : '•'} {deltaMes >= 0 ? '+' : '−'}€{fmt(Math.abs(deltaMes))}{deltaPct !== null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''} vs mes anterior
                  </div>
                ) : (
                  <div className="stat-delta flat">• registrando historial</div>
                )}
              </div>
              <div className="card stat-card">
                <div className="stat-icon"><Icon.wallet /></div>
                <div className="stat-label">Liquidez</div>
                <div className="stat-value" style={{ color: 'var(--green)' }}>€{fmt(totalLiquidez)}</div>
                <div className="stat-delta flat">{cuentas.length} cuentas</div>
              </div>
              <div className="card stat-card">
                <div className="stat-icon"><Icon.coin /></div>
                <div className="stat-label">Crypto</div>
                <div className="stat-value" style={{ color: 'var(--purple)' }}>€{fmt(totalCrypto)}</div>
                <div className="stat-delta flat">ETH €{fmt(ethPrice)}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-icon"><Icon.invoice /></div>
                <div className="stat-label">Por cobrar</div>
                <div className="stat-value" style={{ color: 'var(--amber)' }}>€{fmt(totalPendiente)}</div>
                <div className="stat-delta flat">{facturasPendientes.length} facturas</div>
              </div>
            </div>

            <div className="dash-grid">
              <div className="card card-fill">
                <div className="card-head">
                  <div>
                    <div className="card-title">Evolución del patrimonio</div>
                    <div className="card-kicker" style={{ marginTop: 2 }}>Últimos 12 meses · un punto por mes</div>
                  </div>
                  <div className="chart-legend"><span><i style={{ background: '#fb923c' }} />Patrimonio</span></div>
                </div>
                <PatrimonioChart snapshots={snapshots} actual={totalPatrimonio} />
                {snapshots.filter(s => s.fecha.slice(0, 7) !== mesActualKey).length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>El historial se registra solo: cada día que abrís el hub se guarda un snapshot y el gráfico se va completando mes a mes.</div>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title">Cuentas</div>
                  <button className="icon-btn accent" onClick={() => setModal({ type: 'editCuentas' })} title="Editar saldos"><Icon.edit /></button>
                </div>
                {cuentas.map(c => {
                  const eur = aEuros(c)
                  const pct = totalLiquidez > 0 ? Math.max((eur / totalLiquidez) * 100, 2) : 0
                  return (
                    <div key={c.id} className="row">
                      <div className="acct-avatar" style={{ background: `${c.color}22`, color: c.color, borderColor: `${c.color}55` }}>{c.nombre.slice(0, 2).toUpperCase()}</div>
                      <div className="row-main">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span className="row-title">{c.nombre}</span>
                          <span className="row-amount">{c.moneda === 'USD' ? `$${fmt(c.saldo)}` : `€${fmt(c.saldo)}`}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text3)', marginTop: 1 }}>
                          <span>{c.moneda === 'USD' ? `≈ €${fmt(eur)}` : c.tipo}</span>
                          <span className="mono">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="acct-bar-track"><div className="acct-bar-fill" style={{ width: `${pct}%`, background: c.color }} /></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="dash-grid-2">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Ingresos facturados</div>
                    <div className="card-kicker" style={{ marginTop: 2 }}>Por mes de emisión</div>
                  </div>
                  <div className="chart-legend">
                    <span><i style={{ background: '#f97316' }} />Cobrado</span>
                    <span><i style={{ background: '#fbbf24', opacity: 0.6 }} />Pendiente</span>
                  </div>
                </div>
                <IngresosChart facturas={facturas} />
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div className="card-kicker" style={{ marginBottom: 6 }}>Crypto</div>
                  {crypto.map(c => {
                    const val = c.symbol === 'ETH' ? c.cantidad * ethPrice : 0
                    return (
                      <div key={c.id} className="row">
                        <div className="acct-avatar" style={{ background: 'var(--purple-dim)', color: 'var(--purple)', borderColor: 'rgba(167,139,250,0.35)' }}>{c.symbol}</div>
                        <div className="row-main">
                          <div className="row-title">{c.cantidad} {c.symbol}</div>
                          <div className="row-sub mono">€{fmt2(ethPrice)} / {c.symbol} · precio en vivo</div>
                        </div>
                        <div className="row-side"><span className="row-amount" style={{ color: 'var(--purple)' }}>€{fmt(val)}</span></div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Próximas facturas</div>
                    <div className="card-kicker" style={{ marginTop: 2 }}>€{fmt(totalPendiente)} por cobrar</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setTab('facturas')}>Ver todas →</button>
                </div>
                {facturasPendientes.length === 0 && <div className="chart-empty">No hay facturas pendientes.</div>}
                {facturasPendientes.slice(0, 7).map(f => (
                  <div key={f.id} className="row">
                    <div className="row-main">
                      <div className="row-title" title={`${f.cliente}${f.descripcion ? ` · ${f.descripcion}` : ''}`}>{f.cliente}{f.descripcion ? ` · ${f.descripcion}` : ''}</div>
                      <div className="row-sub">Vence {fmtDate(f.fecha_vencimiento || f.fecha)}{f.numero ? ` · ${f.numero}` : ''}</div>
                    </div>
                    <div className="row-side">
                      <span className="row-amount" style={{ color: 'var(--green)' }}>+€{fmt(f.importe)}</span>
                      <button className="icon-btn ok" onClick={() => marcarCobrada(f)} title="Marcar como cobrada"><Icon.check /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Facturas Tab */}
        {tab === 'facturas' && (
          <div className="card">
            <div className="card-head">
              <div className="card-title">Pendientes <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {facturasPendientes.length}</span></div>
              <span className="row-amount" style={{ color: 'var(--amber)' }}>€{fmt(totalPendiente)}</span>
            </div>
            {facturasPendientes.length === 0 && <div className="chart-empty">No hay facturas pendientes.</div>}
            {facturasPendientes.map(f => (
              <div key={f.id} className="row">
                <div className="row-main">
                  <div className="row-title">{f.cliente}{f.descripcion ? <span style={{ color: 'var(--text3)' }}> · {f.descripcion}</span> : null}</div>
                  <div className="row-sub">{f.numero ? `${f.numero} · ` : ''}Vence {fmtDate(f.fecha_vencimiento || f.fecha)}{f.origen === 'notion' ? ' · Notion' : ''}</div>
                </div>
                <div className="row-side">
                  <span className="row-amount" style={{ color: 'var(--green)' }}>+€{fmt(f.importe)}</span>
                  <span className="pill pill-amber">pendiente</span>
                  <a className="icon-btn accent" href={`/invoice/${f.id}`} target="_blank" rel="noopener noreferrer" title="Ver invoice"><Icon.invoice /></a>
                  <button className="icon-btn ok" onClick={() => marcarCobrada(f)} title="Marcar como cobrada"><Icon.check /></button>
                  <button className="icon-btn danger" onClick={() => deleteFactura(f.id)} title="Borrar"><Icon.x /></button>
                </div>
              </div>
            ))}
            {facturasCobradas.length > 0 && (
              <>
                <div className="card-head" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <div className="card-title">Cobradas <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {facturasCobradas.length}</span></div>
                  <span className="row-amount" style={{ color: 'var(--text2)' }}>€{fmt(facturasCobradas.reduce((s, f) => s + f.importe, 0))}</span>
                </div>
                {[...facturasCobradas].reverse().map(f => (
                  <div key={f.id} className="row muted">
                    <div className="row-main">
                      <div className="row-title">{f.cliente}{f.descripcion ? <span style={{ color: 'var(--text3)' }}> · {f.descripcion}</span> : null}</div>
                      <div className="row-sub">{f.numero ? `${f.numero} · ` : ''}Cobrada {f.fecha_cobro ? fmtDate(f.fecha_cobro) : fmtDate(f.fecha)}</div>
                    </div>
                    <div className="row-side">
                      <span className="row-amount">€{fmt(f.importe)}</span>
                      <span className="pill pill-green">cobrada</span>
                      <a className="icon-btn accent" href={`/invoice/${f.id}`} target="_blank" rel="noopener noreferrer" title="Ver invoice"><Icon.invoice /></a>
                      <button className="icon-btn danger" onClick={() => deleteFactura(f.id)} title="Borrar"><Icon.x /></button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Clientes Tab */}
        {tab === 'clientes' && (
          <div className="card">
            <div className="card-head">
              <div className="card-title">Clientes <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {clientesFiscales.length}</span></div>
            </div>
            {clientesFiscales.length === 0 && <div className="chart-empty">No hay clientes con datos fiscales cargados todavía.</div>}
            {clientesFiscales.map(c => (
              <div key={c.cliente} className="row">
                <div className="row-main">
                  <div className="row-title">{c.cliente}</div>
                  <div className="row-sub">{c.identificador || 'Sin identificador fiscal'}{c.direccion ? ` · ${c.direccion.replace(/\n/g, ', ')}` : ''}</div>
                </div>
                <div className="row-side">
                  <button className="icon-btn accent" onClick={() => setModal({ type: 'editCliente', data: { cliente: c } })} title="Editar"><Icon.edit /></button>
                  <button className="icon-btn danger" onClick={() => deleteClienteFiscal(c.cliente)} title="Borrar"><Icon.x /></button>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              Estos datos se usan para generar el PDF de cada factura.
            </div>
          </div>
        )}

        {tab === 'compras' && <ComprasTab compras={compras} reload={loadData} />}

        {tab === 'impuestos' && (
          <ImpuestosTab facturas={facturas} compras={compras} cuotaMensual={cuotaAutonomo} onSaveCuota={async n => {
            await supabase.from('configuracion').upsert({ clave: 'cuota_autonomo_mensual', valor: String(n) })
            setCuotaAutonomo(n)
          }} />
        )}

        {/* Regularización Tab (temporal) */}
        {tab === 'regularizacion' && (() => {
          const regs = facturas.filter(f => f.origen === 'regularizacion').sort((a, b) => a.fecha.localeCompare(b.fecha))
          const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
          const grupos = new Map<string, Factura[]>()
          for (const f of regs) {
            const k = `${f.fecha.slice(0, 4)} · T${Math.ceil(Number(f.fecha.slice(5, 7)) / 3)}`
            grupos.set(k, [...(grupos.get(k) || []), f])
          }
          return (
            <div className="card">
              <div className="card-head">
                <div className="card-title">Facturas de regularización <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {regs.length}</span></div>
                <span className="row-amount" style={{ color: 'var(--text2)' }}>€{fmt(regs.reduce((s, f) => s + Number(f.importe), 0))}</span>
              </div>
              {regs.length === 0 && <div className="chart-empty">Todavía no hay facturas de regularización.</div>}
              {Array.from(grupos.entries()).map(([k, fs]) => (
                <div key={k} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 6px' }}>
                    <span>{k}</span><span>€{fmt(fs.reduce((s, f) => s + Number(f.importe), 0))}</span>
                  </div>
                  {fs.map(f => (
                    <div key={f.id} className="row">
                      <div className="row-main">
                        <div className="row-title">{f.numero} <span style={{ color: 'var(--text3)' }}>· {f.cliente} · {f.descripcion}{f.numero_referencia ? ` #${f.numero_referencia}` : ''}</span></div>
                        <div className="row-sub">Emitida {fmtFecha(f.fecha)}{f.fecha_cobro ? ` · Cobrada ${fmtFecha(f.fecha_cobro)}` : ''}</div>
                      </div>
                      <div className="row-side">
                        <span className="row-amount">€{fmt(f.importe)}</span>
                        <a className="icon-btn accent" href={`/invoice/${f.id}`} target="_blank" rel="noopener noreferrer" title="Ver invoice"><Icon.invoice /></a>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                Sección temporal. Estas facturas no cuentan en pendientes/cobradas del día a día.
              </div>
            </div>
          )
        })()}

        {/* Presupuesto Tab */}
        {tab === 'presupuesto' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            {(() => {
              const totalFijosGastado = fijos.reduce((s, c) => s + c.gastado, 0)
              const totalFijosLimite = fijos.reduce((s, c) => s + c.limite, 0)
              const totalVarsGastado = variables.reduce((s, c) => s + c.gastado, 0)
              const totalVarsLimite = variables.reduce((s, c) => s + c.limite, 0)
              const totalGastado = totalFijosGastado + totalVarsGastado
              const totalPct = Math.min(Math.round(totalGastado / presupuestoTotal * 100), 100)

              const renderItem = (item: PresupuestoItem, tabla: string) => {
                const pct = item.limite > 0 ? Math.min(Math.round(item.gastado / item.limite * 100), 100) : 0
                return (
                  <div key={item.id} style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>{item.nombre}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)' }}>€{fmt(item.gastado)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>/ </span>
                        <span onClick={() => setModal({ type: 'editLimite', data: { item, tabla } })} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text3)', cursor: 'pointer', textDecoration: 'underline dotted' }}>€{fmt(item.limite)}</span>
                        <button onClick={() => setModal({ type: 'addGasto', data: { item, tabla } })} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ Añadir</button>
                      </div>
                    </div>
                    {item.limite > 0 && (
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 20 }}>
                    <div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Gastado</div><div style={{ fontSize: 16, fontWeight: 500, color: barColor(totalPct) }}>€{fmt(totalGastado)}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text2)' }}>Disponible</div><div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text2)' }}>€{fmt(presupuestoTotal - totalGastado)}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: 'var(--text2)' }}>Presupuesto mes</div><div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text2)' }}>€{fmt(presupuestoTotal)}</div></div>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 24 }}>
                    <div style={{ height: '100%', width: `${totalPct}%`, background: barColor(totalPct) }} />
                  </div>

                  {/* Fijos */}
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Gastos fijos · €{fmt(totalFijosGastado)} / €{fmt(totalFijosLimite)}
                  </div>
                  {fijos.map(item => renderItem(item, 'fijos'))}

                  <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

                  {/* Variables */}
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Gastos variables · €{fmt(totalVarsGastado)} / €{fmt(totalVarsLimite)}
                  </div>
                  {variables.map(item => renderItem(item, 'variables'))}
                </>
              )
            })()}
          </div>
        )}

        {/* Timesheet Ambushed/BoldMove Tab */}
        {tab === 'timesheet_ab' && (
          <TimesheetTab tipo="ambushed_boldmove" proyectos={proyectos} dias={dias} facturas={facturas} reload={loadData} />
        )}

        {/* Timesheet Clientes Propios Tab */}
        {tab === 'timesheet_propios' && (
          <TimesheetTab tipo="propio" proyectos={proyectos} dias={dias} facturas={facturas} reload={loadData} />
        )}

        {/* Modals */}
        {modal && (
          <div className="modal-bg" onClick={() => setModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              {modal.type === 'addFactura' && (
                <ModalAddFactura cuentas={cuentas} clientesFiscales={clientesFiscales} onAdd={addFactura} onClose={() => setModal(null)} />
              )}
              {modal.type === 'addGasto' && (
                <ModalAddGasto item={modal.data.item} tabla={modal.data.tabla} onAdd={addGasto} onClose={() => setModal(null)} />
              )}
              {modal.type === 'editLimite' && (
                <ModalEditLimite item={modal.data.item} tabla={modal.data.tabla} onSave={editLimite} onClose={() => setModal(null)} />
              )}
              {modal.type === 'editCuentas' && (
                <ModalEditCuentas cuentas={cuentas} onUpdate={updateCuentaSaldo} onClose={() => { setModal(null); loadData() }} />
              )}
              {modal.type === 'editCliente' && (
                <ModalCliente cliente={modal.data?.cliente} onSave={saveClienteFiscal} onClose={() => setModal(null)} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}


function ModalAddFactura({ cuentas, clientesFiscales, onAdd, onClose }: { cuentas: Cuenta[], clientesFiscales: ClienteFiscal[], onAdd: (d: any) => void, onClose: () => void }) {
  const [form, setForm] = useState({ cliente: clientesFiscales[0]?.cliente || '', descripcion: '', importe: '', fecha: new Date().toISOString().split('T')[0], cuenta_destino_id: '', idioma: 'es' })
  const [nuevoCliente, setNuevoCliente] = useState(clientesFiscales.length === 0)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoIdentificador, setNuevoIdentificador] = useState('')
  const [nuevoDireccion, setNuevoDireccion] = useState('')
  const fieldStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }

  const confirmar = async () => {
    let cliente = form.cliente
    if (nuevoCliente) {
      if (!nuevoNombre) return
      cliente = nuevoNombre
      await supabase.from('clientes_fiscales').upsert({ cliente: nuevoNombre, identificador: nuevoIdentificador, direccion: nuevoDireccion })
    }
    if (!cliente || !form.importe) return
    onAdd({ ...form, cliente, importe: Number(form.importe), cuenta_destino_id: form.cuenta_destino_id ? Number(form.cuenta_destino_id) : null })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nueva factura <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Cliente</label>
        {!nuevoCliente ? (
          <select value={form.cliente} onChange={e => {
            if (e.target.value === '__nuevo__') { setNuevoCliente(true); return }
            setForm({ ...form, cliente: e.target.value })
          }} style={fieldStyle}>
            {clientesFiscales.map(c => <option key={c.cliente} value={c.cliente}>{c.cliente}</option>)}
            <option value="__nuevo__">+ Cliente nuevo...</option>
          </select>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 7, padding: 12 }}>
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre del cliente" style={{ ...fieldStyle, marginBottom: 8 }} />
            <input value={nuevoIdentificador} onChange={e => setNuevoIdentificador(e.target.value)} placeholder="Identificador fiscal (NIF/CIF, VAT...)" style={{ ...fieldStyle, marginBottom: 8 }} />
            <textarea value={nuevoDireccion} onChange={e => setNuevoDireccion(e.target.value)} placeholder="Dirección" rows={2} style={{ ...fieldStyle, resize: 'vertical' as const, marginBottom: clientesFiscales.length > 0 ? 8 : 0 }} />
            {clientesFiscales.length > 0 && (
              <button type="button" onClick={() => setNuevoCliente(false)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>← Elegir cliente guardado</button>
            )}
          </div>
        )}
      </div>
      {[
        { label: 'Descripción (opcional)', key: 'descripcion', type: 'text', placeholder: 'Proyecto, treatment...' },
        { label: 'Importe (€)', key: 'importe', type: 'number', placeholder: '0' },
        { label: 'Fecha de cobro', key: 'fecha', type: 'date', placeholder: '' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{f.label}</label>
          <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
            onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            style={fieldStyle} />
        </div>
      ))}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Cuenta destino (cuando se cobre)</label>
        <select value={form.cuenta_destino_id} onChange={e => setForm({ ...form, cuenta_destino_id: e.target.value })} style={fieldStyle}>
          <option value="">Seleccionar cuenta...</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Idioma del invoice</label>
        <select value={form.idioma} onChange={e => setForm({ ...form, idioma: e.target.value })} style={fieldStyle}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={confirmar}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Añadir
        </button>
      </div>
    </>
  )
}

function ModalAddGasto({ item, tabla, onAdd, onClose }: { item: PresupuestoItem, tabla: string, onAdd: (tabla: string, id: number, importe: number) => void, onClose: () => void }) {
  const [importe, setImporte] = useState('')
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Añadir gasto · {item.nombre} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Importe (€)</label>
        <input type="number" placeholder="0" value={importe} onChange={e => setImporte(e.target.value)}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => importe && onAdd(tabla, item.id, Number(importe))}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Añadir
        </button>
      </div>
    </>
  )
}

function ModalEditLimite({ item, tabla, onSave, onClose }: { item: PresupuestoItem, tabla: string, onSave: (tabla: string, id: number, limite: number) => void, onClose: () => void }) {
  const [limite, setLimite] = useState(String(item.limite))
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Editar límite · {item.nombre} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Nuevo límite (€)</label>
        <input type="number" value={limite} onChange={e => setLimite(e.target.value)}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => onSave(tabla, item.id, Number(limite))}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Guardar
        </button>
      </div>
    </>
  )
}

function ModalEditCuentas({ cuentas, onUpdate, onClose }: { cuentas: Cuenta[], onUpdate: (id: number, saldo: number) => void, onClose: () => void }) {
  const [values, setValues] = useState<{ [id: number]: string }>(Object.fromEntries(cuentas.map(c => [c.id, String(c.saldo)])))
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Editar saldos <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      {cuentas.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{c.nombre}</span>
          <input type="number" value={values[c.id]} onChange={e => setValues({ ...values, [c.id]: e.target.value })}
            style={{ width: 110, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
        </div>
      ))}
      <button onClick={async () => { await Promise.all(cuentas.map(c => onUpdate(c.id, Number(values[c.id])))); onClose() }}
        style={{ marginTop: 16, width: '100%', padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
        Guardar todos
      </button>
    </>
  )
}

function ModalCliente({ cliente, onSave, onClose }: { cliente?: ClienteFiscal, onSave: (c: ClienteFiscal) => void, onClose: () => void }) {
  const [nombre, setNombre] = useState(cliente?.cliente || '')
  const [identificador, setIdentificador] = useState(cliente?.identificador || '')
  const [direccion, setDireccion] = useState(cliente?.direccion || '')
  const inputStyleLocal = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
  const labelStyleLocal = { display: 'block' as const, fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        {cliente ? `Editar cliente · ${cliente.cliente}` : 'Nuevo cliente'} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyleLocal}>Nombre del cliente</label>
        <input value={nombre} disabled={!!cliente} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ambushed, Hans Emanuel Productions..."
          style={{ ...inputStyleLocal, opacity: cliente ? 0.6 : 1 }} />
        {cliente && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>El nombre no se puede cambiar acá porque es lo que vincula este cliente con sus facturas.</div>}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyleLocal}>Identificador fiscal (NIF/CIF, VAT, teléfono...)</label>
        <input value={identificador} onChange={e => setIdentificador(e.target.value)} placeholder="Ej: 12810068 · VAT 12810068 · 07752660689" style={inputStyleLocal} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyleLocal}>Dirección fiscal</label>
        <textarea value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, número&#10;Ciudad, país" rows={3} style={{ ...inputStyleLocal, resize: 'vertical' as const }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => nombre && onSave({ cliente: nombre, identificador, direccion })}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Guardar
        </button>
      </div>
    </>
  )
}

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
const cancelBtnStyle = { padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }
const confirmBtnStyle = { flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }

const statusColor: Record<string, string> = { activo: 'var(--amber)', completado: 'var(--text2)', facturado: 'var(--green)' }

function TimesheetTab({ tipo, proyectos, dias, facturas, reload }: { tipo: TipoProyecto, proyectos: Proyecto[], dias: DiaTrabajado[], facturas: Factura[], reload: () => void }) {
  const [modal, setModal] = useState<Modal>(null)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [publicUrl, setPublicUrl] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [copyHover, setCopyHover] = useState(false)
  const [clienteFiltro, setClienteFiltro] = useState('todos')

  useEffect(() => {
    if (tipo !== 'ambushed_boldmove') return
    supabase.from('configuracion').select('valor').eq('clave', 'timesheet_public_token').single()
      .then(({ data }) => { if (data?.valor) setPublicUrl(`${window.location.origin}/ab/${data.valor}`) })
  }, [tipo])

  const diasDe = (proyectoId: number) => dias.filter(d => d.proyecto_id === proyectoId).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const totalProyecto = (proyectoId: number) => diasDe(proyectoId).reduce((s, d) => s + Number(d.total_day), 0)
  const ultimaFecha = (proyectoId: number) => {
    const ds = diasDe(proyectoId)
    return ds.length ? ds[ds.length - 1].fecha : ''
  }

  const proyectosFiltrados = proyectos
    .filter(p => p.tipo === tipo)
    .filter(p => clienteFiltro === 'todos' || p.cliente === clienteFiltro)
    .sort((a, b) => {
      const fa = ultimaFecha(a.id) || a.created_at
      const fb = ultimaFecha(b.id) || b.created_at
      return fb.localeCompare(fa)
    })

  const cambiarStatus = async (p: Proyecto, status: string) => {
    if (status === 'facturado') {
      const monto = totalProyecto(p.id)
      if (!confirm(`Marcar "${p.nombre}" como Facturado va a crear una factura pendiente por €${fmt(monto)} y asignarle el próximo Nº de factura. ¿Confirmás?`)) return
    }
    await supabase.from('proyectos').update({ status }).eq('id', p.id)
    reload()
  }

  const addProyecto = async (data: { nombre: string; cliente: string; numero_proyecto: string }) => {
    await supabase.from('proyectos').insert([{ ...data, tipo, status: 'activo' }])
    setModal(null)
    reload()
  }

  const updateNumeroProyecto = async (id: number, numero: string) => {
    await supabase.from('proyectos').update({ numero_proyecto: numero }).eq('id', id)
    await supabase.from('facturas').update({ numero_referencia: numero }).eq('proyecto_id', id)
    reload()
  }

  const deleteProyecto = async (id: number) => {
    if (!confirm('¿Borrar este proyecto y todos sus días?')) return
    await supabase.from('proyectos').delete().eq('id', id)
    reload()
  }

  const addDia = async (proyectoId: number, data: any) => {
    await supabase.from('dias_trabajados').insert([{ proyecto_id: proyectoId, ...data }])
    setModal(null)
    reload()
  }

  const deleteDia = async (id: number) => {
    await supabase.from('dias_trabajados').delete().eq('id', id)
    reload()
  }

  const updateDia = async (id: number, data: any) => {
    await supabase.from('dias_trabajados').update(data).eq('id', id)
    setModal(null)
    reload()
  }

  return (
    <div>
      {tipo === 'ambushed_boldmove' && publicUrl && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
          <span>Link público de solo lectura para Ambushed / BoldMove</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(publicUrl)
              setLinkCopiado(true)
              setTimeout(() => setLinkCopiado(false), 1800)
            }}
            onMouseEnter={() => setCopyHover(true)}
            onMouseLeave={() => setCopyHover(false)}
            style={{
              fontSize: 11, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              background: linkCopiado ? 'var(--green-dim)' : copyHover ? 'var(--border)' : 'none',
              border: `1px solid ${linkCopiado ? 'var(--green)' : 'var(--border)'}`,
              color: linkCopiado ? 'var(--green)' : 'var(--text)',
            }}
          >
            {linkCopiado ? '✓ Link copiado' : 'Copiar link'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        {tipo === 'ambushed_boldmove' ? (
          <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>
            <option value="todos">Todos los clientes</option>
            <option value="Ambushed">Ambushed</option>
            <option value="BoldMove">BoldMove</option>
          </select>
        ) : <div />}
        <button className="btn btn-primary" onClick={() => setModal({ type: 'addProyecto' })}><Icon.plus />Nuevo proyecto</button>
      </div>

      {proyectosFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>No hay proyectos todavía.</div>
      )}

      {proyectosFiltrados.map(p => {
        const total = totalProyecto(p.id)
        const isOpen = expandido === p.id
        return (
          <div key={p.id} className="proj-card">
            <div className="proj-head" onClick={() => setExpandido(isOpen ? null : p.id)}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.cliente}
                  <span>·</span>
                  <input
                    key={p.id + (p.numero_proyecto || '')}
                    defaultValue={p.numero_proyecto || ''}
                    placeholder="Nº de referencia"
                    onClick={e => e.stopPropagation()}
                    onBlur={e => { if (e.target.value !== (p.numero_proyecto || '')) updateNumeroProyecto(p.id, e.target.value) }}
                    style={{ background: 'none', border: 'none', borderBottom: '1px dotted var(--border)', color: 'var(--text3)', fontSize: 11, fontFamily: 'Inter, sans-serif', outline: 'none', width: 110, padding: 0 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500 }}>€{fmt(total)}</div>
                {(() => {
                  if (p.status !== 'facturado') return null
                  const factura = facturas.find(f => f.proyecto_id === p.id)
                  return factura ? (
                    <a className="icon-btn accent" href={`/invoice/${factura.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver/generar factura"><Icon.invoice /></a>
                  ) : null
                })()}
                <select value={p.status} onClick={e => e.stopPropagation()} onChange={e => cambiarStatus(p, e.target.value)}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--surface2)', color: statusColor[p.status], border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>
                  <option value="activo">Activo</option>
                  <option value="completado">Completado</option>
                  <option value="facturado">Facturado</option>
                </select>
                <button className="icon-btn danger" onClick={e => { e.stopPropagation(); deleteProyecto(p.id) }} title="Borrar proyecto"><Icon.x /></button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                {diasDe(p.id).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Sin días cargados.</div>
                )}
                {diasDe(p.id).map(d => (
                  <div key={d.id} onClick={() => setModal({ type: 'editDia', data: { dia: d } })}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12, borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ color: 'var(--text2)', width: 70 }}>{fmtDate(d.fecha)}</div>
                    {tipo === 'ambushed_boldmove' ? (
                      <div style={{ color: 'var(--text3)', flex: 1 }}>{d.hrs}h × €{d.rate}{d.standby_hrs > 0 ? ` · SB ${d.standby_hrs}h` : ''}</div>
                    ) : (
                      <div style={{ color: 'var(--text3)', flex: 1 }}>€{d.rate}/día</div>
                    )}
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', width: 70, textAlign: 'right' }}>€{fmt2(d.total_day)}</div>
                    <span style={{ fontSize: 10, color: 'var(--text3)', width: 80, textAlign: 'right' }}>{d.status}</span>
                    <button className="icon-btn danger" style={{ width: 24, height: 24, marginLeft: 8 }} onClick={e => { e.stopPropagation(); deleteDia(d.id) }} title="Borrar día"><Icon.x /></button>
                  </div>
                ))}
                <button className="btn btn-dashed" style={{ marginTop: 10 }} onClick={() => setModal({ type: 'addDia', data: { proyectoId: p.id } })}><Icon.plus />Nuevo día</button>
              </div>
            )}
          </div>
        )
      })}

      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            {modal.type === 'addProyecto' && (
              <ModalAddProyecto tipo={tipo} onAdd={addProyecto} onClose={() => setModal(null)} />
            )}
            {modal.type === 'addDia' && (
              <ModalAddDia tipo={tipo} onAdd={(d: any) => addDia(modal.data.proyectoId, d)} onClose={() => setModal(null)} />
            )}
            {modal.type === 'editDia' && (
              <ModalAddDia tipo={tipo} dia={modal.data.dia} onAdd={(d: any) => updateDia(modal.data.dia.id, d)} onClose={() => setModal(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalAddProyecto({ tipo, onAdd, onClose }: { tipo: TipoProyecto, onAdd: (d: { nombre: string; cliente: string; numero_proyecto: string }) => void, onClose: () => void }) {
  const [nombre, setNombre] = useState('')
  const [numeroProyecto, setNumeroProyecto] = useState('')
  const [clientesGuardados, setClientesGuardados] = useState<{ cliente: string }[]>([])
  const [cliente, setCliente] = useState(tipo === 'ambushed_boldmove' ? 'Ambushed' : '')
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoIdentificador, setNuevoIdentificador] = useState('')
  const [nuevoDireccion, setNuevoDireccion] = useState('')

  useEffect(() => {
    supabase.from('clientes_fiscales').select('cliente').order('cliente').then(({ data }) => {
      if (data) setClientesGuardados(data)
      if (tipo !== 'ambushed_boldmove' && data && data.length > 0 && !data.some((c: { cliente: string }) => c.cliente === cliente)) {
        setCliente(data[0].cliente)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const crear = async () => {
    let clienteFinal = cliente
    if (nuevoCliente) {
      if (!nuevoNombre) return
      clienteFinal = nuevoNombre
      await supabase.from('clientes_fiscales').upsert({ cliente: nuevoNombre, identificador: nuevoIdentificador, direccion: nuevoDireccion })
    }
    if (!nombre || !clienteFinal) return
    onAdd({ nombre, cliente: clienteFinal, numero_proyecto: numeroProyecto })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nuevo proyecto <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Nombre del proyecto</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Verizon x FIFA World Cup" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Cliente</label>
        {!nuevoCliente ? (
          <select value={cliente} onChange={e => {
            if (e.target.value === '__nuevo__') { setNuevoCliente(true); return }
            setCliente(e.target.value)
          }} style={inputStyle}>
            {tipo === 'ambushed_boldmove' && !clientesGuardados.some(c => c.cliente === 'Ambushed') && <option value="Ambushed">Ambushed</option>}
            {tipo === 'ambushed_boldmove' && !clientesGuardados.some(c => c.cliente === 'BoldMove') && <option value="BoldMove">BoldMove</option>}
            {clientesGuardados.map(c => <option key={c.cliente} value={c.cliente}>{c.cliente}</option>)}
            <option value="__nuevo__">+ Nuevo cliente...</option>
          </select>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 7, padding: 12 }}>
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre del cliente" style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={nuevoIdentificador} onChange={e => setNuevoIdentificador(e.target.value)} placeholder="Identificador (CIF/VAT/registro)" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea value={nuevoDireccion} onChange={e => setNuevoDireccion(e.target.value)} placeholder="Dirección" rows={2} style={{ ...inputStyle, resize: 'vertical' as const, marginBottom: 8 }} />
            <button type="button" onClick={() => setNuevoCliente(false)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>← Elegir cliente guardado</button>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Nº de referencia (para el cliente, ej: 268)</label>
        <input value={numeroProyecto} onChange={e => setNumeroProyecto(e.target.value)} placeholder="Ej: F260099" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
        <button onClick={crear} style={confirmBtnStyle}>Crear</button>
      </div>
    </>
  )
}

function ModalAddDia({ tipo, dia, onAdd, onClose }: { tipo: TipoProyecto, dia?: DiaTrabajado, onAdd: (d: any) => void, onClose: () => void }) {
  const [fecha, setFecha] = useState(dia?.fecha || new Date().toISOString().split('T')[0])
  const [rate, setRate] = useState(dia ? String(dia.rate) : '')
  const [hrs, setHrs] = useState(dia?.hrs != null ? String(dia.hrs) : '')
  const [standby, setStandby] = useState(dia ? String(dia.standby_hrs) : '')
  const [status, setStatus] = useState<string>(dia?.status || 'hecho')

  const submit = () => {
    if (!rate) return
    onAdd({
      fecha,
      rate: Number(rate),
      hrs: tipo === 'ambushed_boldmove' ? Number(hrs || 0) : null,
      standby_hrs: tipo === 'ambushed_boldmove' ? Number(standby || 0) : 0,
      status,
    })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        {dia ? 'Editar día' : 'Nuevo día'} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Fecha</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{tipo === 'ambushed_boldmove' ? 'Rate por hora (€)' : 'Rate por día (€)'}</label>
        <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" style={inputStyle} />
      </div>
      {tipo === 'ambushed_boldmove' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Horas trabajadas</label>
            <input type="number" value={hrs} onChange={e => setHrs(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Stand by hrs</label>
            <input type="number" value={standby} onChange={e => setStandby(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="hecho">Hecho</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
        <button onClick={submit} style={confirmBtnStyle}>{dia ? 'Guardar' : 'Agregar'}</button>
      </div>
    </>
  )
}

