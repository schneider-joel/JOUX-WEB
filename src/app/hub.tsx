'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ComprasTab from './compras-tab'
import { usePathname, useRouter } from 'next/navigation'
import { usePublicarMarco } from './app-shell'
import { rutaDeTab, tabDeRuta } from './rutas'
import ImpuestosTab, { proximoPago, claveReal, type Reales } from './impuestos-tab'
import CuentasCard from './cuentas-card'
import MarcaCard from './marca-card'
import Link from 'next/link'
import PatrimonioEvolucion from './patrimonio-evolucion'
import type { Hoy } from '@/lib/pendientes'
import { totalACobrar, desglose, desgloseFactura } from '@/lib/importes'
import MarcaTab, { type AccionesAgencia } from './marca-tab'
import { DEMO_FACTURAS, DEMO_MARCAS, DEMO_PROYECTOS, aProyectoAgencia, facturaSueltaAAgencia, demoMarcasActivo, esAgencia, porOrden, type Marca } from '@/lib/marcas'
import BancosTab from './bancos-tab'
import CompartidosVista from './compartidos-vista'
import PresupuestoCards, { gastadoPorPartida } from './presupuesto-card'
import type { GastoCompartido } from '@/lib/compartidos'
import { PAISES, PaisFiscal, detectarPais, tipoFacturaDePais } from '@/lib/clientes'
import { GrupoTimesheet, grupoDeCliente, gruposTimesheet, linkPublico, tipoLegacy } from '@/lib/timesheets'
import { supabase, batchQuery, Compra, Cuenta, Crypto, Factura, PresupuestoItem, Proyecto, DiaTrabajado, PatrimonioSnapshot, ClienteFiscal } from '@/lib/supabase'

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (7570 → 7.570).
const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...agrupar }).format(n)
// Clientes de España: " · base €350,00 + IVA €73,50 − ret. €52,50" (al resto, nada).
const lineaImpuestos = (f: { importe: number; tipo_factura?: string | null }) => {
  const d = desgloseFactura(f)
  return d ? ` · base €${fmt2(d.base)} + IVA €${fmt2(d.iva)} − ret. €${fmt2(d.ret)}` : ''
}
// Hoy: saludo según la hora de Valencia.
const saludo = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date())); return h < 6 ? 'Buenas noches, Joel' : h < 14 ? 'Buenos días, Joel' : h < 21 ? 'Buenas tardes, Joel' : 'Buenas noches, Joel' }
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

// Los timesheets son dinámicos: una pestaña "ts:<key>" por grupo de clientes (ver lib/timesheets).
type Tab = 'dashboard' | 'patrimonio' | 'facturas' | 'compras' | 'impuestos' | 'presupuesto' | 'clientes' | 'bancos' | 'compartidos' | `ts:${string}` | `mk:${string}`
type Seccion = { id: string; label: string; icon: () => JSX.Element; tabs: { id: Tab; label: string; badge?: number }[] }
type NuevoProyecto = { nombre: string; cliente: string; numero_proyecto: string; modo_rate: 'hora' | 'dia' }
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
  // Solo los meses con historial (mínimo 4), para que con pocos datos no
  // quede un gráfico enorme y vacío.
  const primero = snapshots.reduce((m, s) => (s.fecha.slice(0, 7) < m ? s.fecha.slice(0, 7) : m), hoyLocal().slice(0, 7))
  const desdePrimero = ultimosMeses(12).filter(m => m >= primero).length
  const meses = ultimosMeses(Math.max(4, desdePrimero))
  const mesActual = meses[meses.length - 1]
  const porMes = new Map<string, number>()
  for (const s of [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha))) porMes.set(s.fecha.slice(0, 7), Number(s.total))
  porMes.set(mesActual, actual)
  const puntos = meses.map((m, i) => ({ m, i, v: porMes.get(m) })).filter(p => p.v !== undefined) as { m: string, i: number, v: number }[]

  // Línea fina sin ejes, como la web: el valor de cada mes sale al pasar por encima.
  const [cursor, setCursor] = useState<number | null>(null)
  const padX = 6, padT = 12, padB = 12
  const vals = puntos.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || Math.max(max * 0.1, 1)
  const lo = min - span * 0.25, hi = max + span * 0.25
  const x = (i: number) => padX + (i / (meses.length - 1)) * (W - padX * 2)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const path = puntos.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')
  const area = puntos.length > 1 ? `${path} L${x(puntos[puntos.length - 1].i)},${H} L${x(puntos[0].i)},${H} Z` : ''
  const last = puntos[puntos.length - 1]
  const sel = cursor !== null ? puntos[cursor] : null
  const alPasar = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !puntos.length) return
    const px = clientX - r.left
    let k = 0
    puntos.forEach((p, j) => { if (Math.abs(x(p.i) - px) < Math.abs(x(puntos[k].i) - px)) k = j })
    setCursor(k)
  }
  const etiquetaMes = (m: string) => `${fmtMes(m)}${m.slice(0, 4) !== mesActual.slice(0, 4) ? ` ${m.slice(2, 4)}` : ''}`

  return (
    <div className="spark-wrap">
      <div className={`spark${sel ? ' is-hover' : ''}`} ref={ref} onPointerMove={e => alPasar(e.clientX)} onPointerDown={e => alPasar(e.clientX)} onPointerLeave={() => setCursor(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <defs>
            <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill="url(#pgrad)" />}
          {puntos.length > 1 && <path className="spark__line" d={path} />}
          {sel && <line className="spark__cur" x1={x(sel.i)} x2={x(sel.i)} y1={0} y2={H} />}
          {sel && <circle className="spark__pt" cx={x(sel.i)} cy={y(sel.v)} r={4} />}
        </svg>
        {last && <i className="dot dot--green spark__end" style={{ left: x(last.i), top: y(last.v) }} aria-hidden="true" />}
        {sel && (
          <span className="tip caps spark__tip" style={{ left: x(sel.i), transform: `translateX(${x(sel.i) < W * 0.12 ? '0' : x(sel.i) > W * 0.88 ? '-100%' : '-50%'})` }}>
            {etiquetaMes(sel.m)} · €{fmt(sel.v)}
          </span>
        )}
      </div>
      <div className="spark__meses caps" aria-hidden="true"><span>{etiquetaMes(meses[0])}</span><span>{etiquetaMes(mesActual)}</span></div>
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
  // Barras finas: lo cobrado, sólido; lo pendiente, rayado. Encima, el total del mes.
  const padT = 20, padB = 26
  const bw = W / meses.length
  const h = (v: number) => (v / max) * (H - padT - padB)
  return (
    <div className="bars" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Ingresos facturados por mes de emisión">
        <defs>
          <pattern id="rayas" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--dim)" strokeWidth="1.2" />
          </pattern>
        </defs>
        {datos.map((d, i) => {
          const cx = bw * i + bw / 2
          const w = Math.min(bw * 0.5, 14)
          const hc = h(d.cobrado), hp = h(d.pendiente)
          const total = d.cobrado + d.pendiente
          return (
            <g key={d.m}>
              {hc > 0 && <rect className="bars__c" x={cx - w / 2} y={H - padB - hc} width={w} height={hc} rx="2" />}
              {hp > 0 && <rect className="bars__p" x={cx - w / 2 + 0.5} y={H - padB - hc - hp + 0.5} width={w - 1} height={Math.max(0, hp - 1)} rx="2" fill="url(#rayas)" />}
              {!total && <rect x={cx - w / 2} y={H - padB - 2} width={w} height={2} rx="1" fill="var(--line)" />}
              {total > 0 && <text className="bars__v" x={cx} y={H - padB - hc - hp - 7} textAnchor="middle">{(total / 1000).toFixed(1)}k</text>}
              <text className={`bars__m${i === meses.length - 1 ? ' is-now' : ''}`} x={cx} y={H - 6} textAnchor="middle">{fmtMes(d.m)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Las pantallas del antiguo Overview. Desde el rediseño (fase 1) cada pestaña es una ruta (ver rutas.ts) y
// este componente vive en el layout de (app)/(hub): se monta una vez y pinta la pantalla de la ruta.
export default function Hub({ children }: { children?: React.ReactNode }) {
  const ruta = usePathname()
  const router = useRouter()
  const publicarMarco = usePublicarMarco()
  const [marcas, setMarcas] = useState<Marca[]>([])
  // Pestaña = ruta. /work/<key> es `mk:` si la marca es de webs (precio cerrado) y `ts:` si es de treatments.
  const tab = tabDeRuta(ruta, k => (demoMarcasActivo() ? DEMO_MARCAS : marcas).some(m => m.key === k && esAgencia(m))) as Tab
  const setTab = (t: Tab) => { const r = rutaDeTab(t); if (r && r !== ruta) router.push(r) }
  // Vuelta de la conexión con un banco: /?tab=bancos&ok=1 o &error=... llega (redirigida por la página
  // de /) como /finanzas/bancos?ok=1 o ?error=...
  const [mensajeBanco, setMensajeBanco] = useState<{ ok?: boolean; error?: string } | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (window.location.pathname !== '/finanzas/bancos' || !(p.get('ok') || p.get('error'))) return
    setMensajeBanco({ ok: !!p.get('ok'), error: p.get('error') || undefined })
    window.history.replaceState(null, '', '/finanzas/bancos')
  }, [])
  // Proyecto que se abrió desde «Proyectos activos»: su pestaña lo muestra desplegado y se baja hasta él.
  const [abrirProyecto, setAbrirProyecto] = useState<number | null>(null)
  useEffect(() => {
    if (abrirProyecto == null) return
    const t = setTimeout(() => {
      document.getElementById(`proyecto-${abrirProyecto}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setAbrirProyecto(null)
    }, 60)
    return () => clearTimeout(t)
  }, [abrirProyecto, tab])
  const [modal, setModal] = useState<Modal>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [crypto, setCrypto] = useState<Crypto[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [fijos, setFijos] = useState<PresupuestoItem[]>([])
  // Cuentas del hub que actualiza un banco conectado (no se editan a mano).
  const [cuentasBanco, setCuentasBanco] = useState<number[]>([])
  const [compartidos, setCompartidos] = useState<GastoCompartido[] | null>(null)
  const [movsBanco, setMovsBanco] = useState<{ fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }[]>([])
  const [variables, setVariables] = useState<PresupuestoItem[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [dias, setDias] = useState<DiaTrabajado[]>([])
  const [clientesFiscales, setClientesFiscales] = useState<ClienteFiscal[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [cuotaAutonomo, setCuotaAutonomo] = useState(0)
  const [impuestosReales, setImpuestosReales] = useState<Reales>({})
  const [snapshots, setSnapshots] = useState<PatrimonioSnapshot[]>([])
  const [ethPrice, setEthPrice] = useState<number>(2100)
  const [usdToEur, setUsdToEur] = useState<number>(0.92)
  const [mesActual, setMesActual] = useState('2026-09')
  const [presupuestoTotal, setPresupuestoTotal] = useState(1800)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  // Lectura más antigua de los bancos, para la esquina de arriba (null = sin bancos conectados o aún cargando).
  const [bancosSync, setBancosSync] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    const [c, cr, f, fi, v, cfg, pr, di, sn, cf, co, mv, bk, mk] = await batchQuery([
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
      supabase.from('movimientos').select('fecha,importe,categoria,clase,trabajo').order('fecha', { ascending: false }).limit(800),
      supabase.from('bancos_cuentas').select('cuenta_id'),
      supabase.from('marcas').select('*').order('created_at'),
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
    if (mv.data) setMovsBanco(mv.data)
    if (mk.data) setMarcas(mk.data)
    fetch('/api/compartidos').then(r => r.ok ? r.json() : null).then(j => setCompartidos(j?.gastos || null)).catch(() => {})
    if (bk.data) setCuentasBanco(bk.data.map((b: { cuenta_id: number | null }) => b.cuenta_id).filter(Boolean))
    if (cfg.data) {
      const mes = cfg.data.find((x: any) => x.clave === 'mes_actual')?.valor
      const pt = cfg.data.find((x: any) => x.clave === 'presupuesto_total')?.valor
      const cuota = cfg.data.find((x: any) => x.clave === 'cuota_autonomo_mensual')?.valor
      if (cuota) setCuotaAutonomo(Number(cuota))
      const reales: Reales = {}
      for (const x of cfg.data as { clave: string; valor: string }[]) {
        const m = x.clave.match(/^impuesto_real_(\d{4})_(\d)$/)
        if (m) try { reales[`${m[1]}-${m[2]}`] = JSON.parse(x.valor) } catch {}
      }
      setImpuestosReales(reales)
      if (mes) setMesActual(mes)
      if (pt) setPresupuestoTotal(Number(pt))
    }
    setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  // Hoy: lo pendiente, proyectos por etapa y próximas fechas (lib/pendientes.ts). Se vuelve a pedir al actualizar.
  const [hoy, setHoy] = useState<Hoy | null>(null)
  useEffect(() => { fetch('/api/hoy').then(r => r.ok ? r.json() : null).then(j => { if (j) setHoy(j) }).catch(() => {}) }, [lastUpdated])

  // Al abrir el hub, si los bancos llevan más de 3 h sin sincronizar, se
  // sincronizan en segundo plano (los bancos permiten ~4 lecturas al día).
  useEffect(() => {
    supabase.from('bancos_sesiones').select('ultimo_sync').then(async ({ data }) => {
      if (!data?.length) return
      const masViejo = Math.min(...data.map((s: { ultimo_sync: string | null }) => s.ultimo_sync ? new Date(s.ultimo_sync).getTime() : 0))
      setBancosSync(masViejo)
      if (Date.now() - masViejo < 3 * 3600e3) return
      const r = await fetch('/api/bancos/sincronizar', { method: 'POST' }).catch(() => null)
      if (r?.ok) { setBancosSync(Date.now()); loadData() }
    })
  }, [loadData])

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
    // Registros internos (timesheets de períodos ya declarados) no son la
    // factura real: la declarada está importada aparte como histórica.
    if (f.fiscal === false) return false
    // Pagos de webs (crear_factura_pago): su proyecto de precio cerrado nunca
    // pasa a "Facturado", así que la regla del timesheet las ocultaría siempre.
    if (!f.proyecto_id || f.pago) return true
    const p = proyectos.find(p => p.id === f.proyecto_id)
    return !p || p.status === 'facturado'
  }
  const facturasFiscales = facturas.filter(f => f.fiscal !== false)
  const facturasVisibles = facturas.filter(facturaVisible)
  const facturasPendientes = facturasVisibles.filter(f => f.estado === 'pendiente')
  const facturasCobradas = facturasVisibles.filter(f => f.estado === 'cobrada')
  // Lo que cobrarás de verdad (IVA y retención incluidos si el cliente es de España), no la base.
  const totalPendiente = facturasPendientes.reduce((s, f) => s + totalACobrar(f), 0)

  // Filtro de período de la pestaña Facturas (el trimestre sale de la fecha).
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear())
  const [filtroTrim, setFiltroTrim] = useState(0)
  const trimDe = (fecha: string) => Math.ceil(Number(fecha.slice(5, 7)) / 3)
  const enFiltro = (f: Factura) => Number(f.fecha.slice(0, 4)) === filtroAnio && (!filtroTrim || trimDe(f.fecha) === filtroTrim)
  const aniosFacturas = Array.from(new Set([new Date().getFullYear(), ...facturasVisibles.map(f => Number(f.fecha.slice(0, 4)))])).sort((a, b) => b - a)
  // Facturas cuya fecha queda fuera de orden respecto de su número (misma serie).
  const fueraDeOrden = new Set<number>()
  {
    const series = new Map<string, Factura[]>()
    for (const f of facturasVisibles) {
      const m = f.numero?.match(/^(.*?)(\d+)$/)
      if (m) series.set(m[1], [...(series.get(m[1]) || []), f])
    }
    Array.from(series.values()).forEach(fs => {
      const orden = fs.sort((a, b) => Number(a.numero!.match(/(\d+)$/)![1]) - Number(b.numero!.match(/(\d+)$/)![1]))
      orden.forEach((f, i) => {
        if ((i > 0 && f.fecha < orden[i - 1].fecha) || (i < orden.length - 1 && f.fecha > orden[i + 1].fecha)) fueraDeOrden.add(f.id)
      })
    })
  }

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

  // El proyecto va al timesheet de su cliente (o al del grupo al que pertenece).
  const addProyecto = async (data: NuevoProyecto) => {
    // Los proyectos con timesheet son treatments: Ambushed/BoldMove (ab) o The Pitch Lab (Tays/Hans y
    // clientes nuevos, o la marca de la pestaña abierta). Las webs se crean desde su pestaña en Webs.
    const grupo = grupoDeCliente(data.cliente).key
    const marca = grupo === 'ab' ? 'ab' : grupo === 'th' ? 'pitchlab' : tab.startsWith('ts:') ? tab.slice(3) : 'pitchlab'
    await supabase.from('proyectos').insert([{ ...data, tipo: tipoLegacy(data.cliente), status: 'activo', marca }])
    setModal(null)
    await loadData()
    setTab(`ts:${marca}`)
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




  const updateCuenta = async (id: number, patch: Partial<Cuenta>) => {
    await supabase.from('cuentas').update(patch).eq('id', id)
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

  // El marco enseña el estado de los bancos y «Actualizar» (antes, en las esquinas de esta pantalla).
  useEffect(() => { publicarMarco({ bancosSync, actualizar: loadData, datos: lastUpdated }) }, [publicarMarco, bancosSync, loadData, lastUpdated])
  useEffect(() => () => publicarMarco({ actualizar: undefined, datos: undefined }), [publicarMarco])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text3)', gap: 10, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }} />
      Cargando...
    </div>
  )

  // Pocas secciones (caben en la barra inferior del móvil); las que agrupan
  // varias pestañas las muestran como subpestañas bajo el título.
  // Agencias (marcas de precio cerrado): una pestaña por marca; sus clientes no van a Timesheets.
  // Con ?demo=marcas se ven datos de ejemplo y nada se escribe.
  const demoMarcas = demoMarcasActivo()
  const marcasLista = [...(demoMarcas ? DEMO_MARCAS : marcas)].sort(porOrden)
  const agencias = marcasLista.filter(esAgencia)
  const deAgencia = (p: Proyecto) => agencias.some(m => m.key === p.marca)
  const proyectosAgencia = demoMarcas ? DEMO_PROYECTOS : [
    // Webs antiguas sin precio cerrado y sin factura fiscal propia (solo el registro interno del timesheet) no salen:
    // su factura real está entre las sueltas de abajo.
    ...proyectos.filter(deAgencia).map(p => aProyectoAgencia(p, facturas, clientesFiscales)).filter(p => p.unica || p.precio > 0 || proyectos.find(x => x.id === p.id)?.precio_cerrado != null),
    // Webs facturadas a mano, sin proyecto (Hans Emanuel Productions, Jaleo…): una fila por factura.
    ...facturas.filter(f => !f.proyecto_id && f.fiscal !== false && agencias.some(m => m.key === f.marca)).map(facturaSueltaAAgencia),
  ]
  const accionesAgencia: AccionesAgencia = {
    facturar: async (proyecto_id, pago) => {
      const r = await fetch('/api/agencias/facturar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proyecto_id, pago }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return j.error || 'No se pudo crear la factura'
      await loadData(); return null
    },
    cobrar: async id => {
      const f = facturas.find(x => x.id === id)
      if (!f) return 'Factura no encontrada'
      await marcarCobrada(f); return null
    },
    // Proyecto de precio cerrado: nunca pasa a «facturado» (lo impide la base de datos), se factura por pagos.
    nuevo: async p => {
      const { error } = await supabase.from('proyectos').insert([{ nombre: `Web ${p.web}`, cliente: p.cliente, tipo: tipoLegacy(p.cliente), status: 'activo', modo_rate: 'dia', marca: p.marca, web: p.web, plan: p.plan || null, precio_cerrado: p.precio }])
      if (error) return error.message
      await loadData(); return null
    },
  }
  // Treatments: una pestaña por marca con timesheet (Ambushed/BoldMove, The Pitch Lab…); dentro, un
  // bloque por cliente o grupo con su propio link público. Un cliente nuevo no crea pestaña.
  const marcasTs = marcasLista.filter(m => !esAgencia(m))
  const proyectosTs = proyectos.filter(p => !deAgencia(p))
  const marcaTsDe = (p: Proyecto) => marcasTs.some(m => m.key === p.marca) ? p.marca! : grupoDeCliente(p.cliente).key === 'ab' ? 'ab' : 'pitchlab'
  const timesheets = marcasTs.map(m => ({
    id: `ts:${m.key}` as Tab, label: m.nombre,
    badge: proyectosTs.filter(p => marcaTsDe(p) === m.key && p.status === 'activo').length,
  }))
  // Badge = pagos pendientes de cobro de la marca.
  const marcasTabs = agencias.map(m => ({ id: `mk:${m.key}` as Tab, label: m.nombre, badge: proyectosAgencia.filter(p => p.marca === m.key).flatMap(p => p.pagos).filter(x => x.estado === 'pendiente').length }))
  const secciones: Seccion[] = [
    { id: 'overview', label: 'Overview', icon: Icon.home, tabs: [{ id: 'dashboard', label: 'Overview' }] },
    { id: 'treatments', label: 'Treatments', icon: Icon.clock, tabs: timesheets },
    ...(marcasTabs.length ? [{ id: 'webs', label: 'Webs', icon: Icon.coin, tabs: marcasTabs }] : []),
    {
      id: 'facturacion', label: 'Facturación', icon: Icon.invoice, tabs: [
        { id: 'facturas', label: 'Facturas', badge: facturasPendientes.length },
        { id: 'compras', label: 'Compras' },
        { id: 'impuestos', label: 'Impuestos' },
        { id: 'clientes', label: 'Clientes' },
      ],
    },
    { id: 'bancos', label: 'Bancos', icon: Icon.link, tabs: [{ id: 'bancos', label: 'Bancos' }] },
    { id: 'compartidos', label: 'Compartidos', icon: Icon.users, tabs: [{ id: 'compartidos', label: 'Compartidos' }] },
  ]
  // Hoy cuenta el impuesto del trimestre como pendiente si vence en 15 días (igual que su lista).
  const pagoT = proximoPago(facturasFiscales, compras, cuotaAutonomo, impuestosReales)
  const impuestoCerca = !!pagoT && (new Date(pagoT.plazo + 'T00:00:00').getTime() - new Date(hoyLocal() + 'T00:00:00').getTime()) / 86400000 <= 15
  // Insignias del menú: las mismas que tenían las pestañas (pagos pendientes de cada web, treatments activos, facturas pendientes).
  const insignias = Object.fromEntries(secciones.flatMap(s => s.tabs).filter(t => t.badge).map(t => [t.id, t.badge!]))
  const marcaTsActiva = tab.startsWith('ts:') ? marcasTs.find(m => `ts:${m.key}` === tab) || null : null
  const proyectosMarcaTs = marcaTsActiva ? proyectosTs.filter(p => marcaTsDe(p) === marcaTsActiva.key) : []
  const gruposMarcaTs = gruposTimesheet(proyectosMarcaTs).filter(g => proyectosMarcaTs.some(p => g.clientes.includes(p.cliente)))
  const titulos: Record<string, [string, string]> = {
    dashboard: [saludo(), new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })],
    facturas: ['Facturas', `${facturasPendientes.length} pendientes · €${fmt(totalPendiente)} por cobrar`],
    patrimonio: ['Patrimonio', 'Dónde está el dinero y cómo evoluciona'],
    presupuesto: ['Presupuesto', 'Gastos del mes'],
    clientes: ['Clientes', `${clientesFiscales.length} con datos fiscales guardados`],
    compras: ['Compras', 'Facturas de gastos y compras'],
    impuestos: ['Impuestos', 'Estimación trimestral de IRPF (130) e IVA (303)'],
    bancos: ['Bancos', 'Saldos y movimientos de tus cuentas, en automático'],
    compartidos: ['Gastos compartidos', 'La cuenta con tu pareja: quién pagó qué y quién debe a quién'],
  }
  const marcaActiva = tab.startsWith('mk:') ? agencias.find(m => `mk:${m.key}` === tab) || null : null
  const [titulo, subtitulo] = marcaTsActiva ? [marcaTsActiva.nombre, 'Treatments · proyectos, días y facturación']
    : marcaActiva ? [marcaActiva.nombre, 'Webs de precio cerrado · 50 % al empezar, 50 % al publicar'] : titulos[tab] || ['', '']

  return (
    <>
      <PublicarInsignias insignias={hoy ? { ...insignias, hoy: hoy.pendientes.length + (impuestoCerca ? 1 : 0) } : insignias} />
      {/* Las pantallas ya migradas van en la columna de la maqueta (724 px) */}
      <main className={`main${['facturas', 'compras', 'impuestos', 'clientes', 'bancos', 'compartidos'].includes(tab) || tab.startsWith('ts:') || tab.startsWith('mk:') ? ' main--col' : ''}`}>
        <header className="page-header">
          <div className="page-header__txt">
            <h1 className="page-title">{titulo}</h1>
            {subtitulo && <p className="tags caps">{subtitulo}</p>}
          </div>
          <div className="header-actions">
            {!marcaActiva && <button className={tab === 'clientes' ? 'ghost' : 'pill'} onClick={() => setModal({ type: 'addProyecto' })}><Icon.plus />Nuevo proyecto</button>}
            {tab === 'clientes' && <button className="pill" onClick={() => setModal({ type: 'editCliente' })}><Icon.plus />Nuevo cliente</button>}
          </div>
        </header>

        {/* Marca: cifras, tablero por etapa y terminados (los prepara su página del servidor, /work/[marca]); debajo, su pestaña de siempre */}
        {(marcaActiva || marcaTsActiva) && children}

        {/* Overview: lo justo de cada sección, como la web; el detalle está en su pantalla */}
        {/* Hoy (rediseño, fase 4): cifras, patrimonio y lo pendiente, proyectos por etapa, próximas fechas y las
            facturas por cobrar (con su ✓). Cuentas, ingresos por marca y presupuesto están en Finanzas › Patrimonio. */}
        {tab === 'dashboard' && (() => {
          const pago = proximoPago(facturasFiscales, compras, cuotaAutonomo, impuestosReales)
          const hoyISO = hoyLocal(), mesISO = hoyISO.slice(0, 7)
          const cobradoMes = facturasFiscales.filter(f => f.estado === 'cobrada' && (f.fecha_cobro || f.fecha).slice(0, 7) === mesISO).reduce((t, f) => t + totalACobrar(f), 0)
          const facturadoMes = facturasFiscales.filter(f => f.fecha.slice(0, 7) === mesISO).reduce((t, f) => t + totalACobrar(f), 0)
          const vencidas = facturasPendientes.filter(f => (f.fecha_vencimiento || f.fecha) < hoyISO).length
          const leadsHoy = (hoy?.pendientes || []).filter(x => x.clave.startsWith('l'))
          // El impuesto del trimestre entra en «Pendiente» si vence en 15 días, y siempre en «Próximas fechas».
          const diasPago = pago ? Math.round((new Date(pago.plazo + 'T00:00:00').getTime() - new Date(hoyISO + 'T00:00:00').getTime()) / 86400000) : null
          const pendientes = [
            ...(pago && diasPago != null && diasPago <= 15 ? [{ clave: 'imp', texto: `Pagar IVA e IRPF del T${pago.q}${pago.declarado ? ' (gestor)' : pago.cerrado ? '' : ' (estimado)'}`, sub: `€${fmt2(pago.total)} · ${diasPago <= 0 ? 'vence hoy' : `vence el ${fmtDate(pago.plazo)}`}`, href: '/finanzas/impuestos', urgencia: 400 - diasPago }] : []),
            ...(hoy?.pendientes || []),
          ].sort((a, b) => b.urgencia - a.urgencia)
          const fechas = [
            ...(pago ? [{ clave: 'imp', fecha: pago.plazo, texto: `IVA e IRPF del T${pago.q}`, sub: `€${fmt2(pago.total)}${pago.declarado ? ' · del gestor' : ' · estimado'}`, href: '/finanzas/impuestos' }] : []),
            ...(hoy?.fechas || []),
          ].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8)
          const enMarcha = (hoy?.etapas || []).reduce((t, e) => t + e.n, 0)
          return (
          <div className="col hoy">
            <section className="fx__kpis" aria-label="Resumen">
              <div className="fx__kpi">
                <span className="fx__l">Patrimonio</span>
                <span className="fx__v">€{fmt(totalPatrimonio)}</span>
                <span className="fx__s">{deltaMes !== null ? `${deltaMes >= 0 ? '+' : '−'}€${fmt(Math.abs(deltaMes))} desde el mes pasado` : 'Registrando historial'}</span>
              </div>
              <div className="fx__kpi">
                <span className="fx__l">Cobrado en {new Date().toLocaleDateString('es-ES', { month: 'long' })}</span>
                <span className="fx__v">€{fmt(cobradoMes)}</span>
                <span className="fx__s">€{fmt(facturadoMes)} facturados este mes</span>
              </div>
              <Link href="/finanzas/facturas" className="fx__kpi hoy__k">
                <span className="fx__l">Pendiente de cobro</span>
                <span className="fx__v">€{fmt(totalPendiente)}</span>
                <span className={`fx__s${vencidas ? ' aviso' : ''}`}>{vencidas ? `${vencidas} factura${vencidas === 1 ? '' : 's'} vencida${vencidas === 1 ? '' : 's'}` : `${facturasPendientes.length} pendientes`}</span>
              </Link>
              <Link href="/leads" className="fx__kpi hoy__k">
                <span className="fx__l">Leads por atender</span>
                <span className="fx__v">{hoy ? leadsHoy.length : '…'}</span>
                <span className="fx__s">{leadsHoy.length ? Array.from(new Set(leadsHoy.map(l => l.sub.split(' · ')[0].replace('Lead de ', '')))).join(' · ') : 'Ninguno esperando'}</span>
              </Link>
            </section>

            <div className="hoy__g">
              <section className="fx__card" aria-labelledby="hoy-pat">
                <header><h2 id="hoy-pat">Patrimonio · 12 meses</h2><Link href="/finanzas" className="caps dim">Patrimonio →</Link></header>
                <PatrimonioChart snapshots={snapshots} actual={totalPatrimonio} />
                {snapshots.filter(s => s.fecha.slice(0, 7) !== mesActualKey).length < 2 && <p className="nota">Se guarda un punto cada día que abres el hub; el gráfico se completa mes a mes.</p>}
              </section>
              <section className="fx__card" aria-labelledby="hoy-pend">
                <header><h2 id="hoy-pend">Pendiente</h2><span className="caps" style={{ color: pendientes.length ? 'var(--amber)' : 'var(--dim)' }}>{hoy ? pendientes.length : '…'}</span></header>
                {!hoy ? <p className="nota">Cargando…</p> : pendientes.length === 0 ? <p className="nota">Nada pendiente. Buen trabajo.</p> : (
                  <ul className="hoy__todo">
                    {pendientes.slice(0, 7).map(x => (
                      <li key={x.clave}><Link href={x.href}><i aria-hidden="true" /><span><b>{x.texto}</b><span>{x.sub}</span></span></Link></li>
                    ))}
                  </ul>
                )}
                {pendientes.length > 7 && <p className="nota">y {pendientes.length - 7} más</p>}
              </section>
            </div>

            {enMarcha > 0 && hoy && (
              <section className="fx__card" aria-labelledby="hoy-work">
                <header><h2 id="hoy-work">Work · {enMarcha} proyecto{enMarcha === 1 ? '' : 's'} en marcha</h2><Link href="/work" className="caps dim">Ver proyectos →</Link></header>
                <div className="hoy__bar" aria-label="Proyectos por etapa">
                  {hoy.etapas.filter(e => e.n).map(e => <span key={e.fase} style={{ flex: e.n }} className={e.esperan ? 'is-toca' : undefined}><b>{e.n}</b><small>{e.etiqueta}</small></span>)}
                </div>
                {hoy.esperan.length > 0 && (
                  <div className="hoy__tres">
                    {hoy.esperan.map(p => (
                      <Link key={p.id} href={`/proyectos/${p.id}`} className="mk__card is-toca">
                        <b>{p.cliente}</b>
                        <span className="mk__m"><span>{p.nombre}</span><span>{p.dias === 0 ? 'hoy' : `${p.dias} d`}</span></span>
                        <span className="mk__toca">{p.toca}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            {fechas.length > 0 && (
              <section className="fx__card" aria-labelledby="hoy-fe">
                <header><h2 id="hoy-fe">Próximas fechas</h2><span className="caps dim">3 semanas</span></header>
                <ol className="hoy__fechas">
                  {fechas.map(f => {
                    const dentro = <><span className="caps dim">{fmtDate(f.fecha)}</span><b>{f.texto}</b><small>{f.sub}</small></>
                    return <li key={f.clave}>{f.href ? <Link href={f.href}>{dentro}</Link> : <span>{dentro}</span>}</li>
                  })}
                </ol>
              </section>
            )}


            <section className="block" aria-label="Por cobrar">
              <p className="label caps"><span>Por cobrar</span><i className="rule" /><button type="button" className="label__m copy" onClick={() => setTab('facturas')}>Facturas →</button></p>
              {facturasPendientes.length === 0 ? <p className="empty">No hay facturas pendientes.</p> : (
                <ul className="list focus">
                  {facturasPendientes.slice(0, 7).map(f => (
                    <li key={f.id} className="fila">
                      <div className="fila__main">
                        <span className="fila__t" title={`${f.cliente}${f.descripcion ? ` · ${f.descripcion}` : ''}`}>{f.cliente}{f.descripcion ? <span> · {f.descripcion}</span> : null}</span>
                        <span className="fila__s caps" title={`Vence ${fmtDate(f.fecha_vencimiento || f.fecha)}${f.numero ? ` · ${f.numero}` : ''}${lineaImpuestos(f)}`}>Vence {fmtDate(f.fecha_vencimiento || f.fecha)}{f.numero ? ` · ${f.numero}` : ''}{lineaImpuestos(f)}</span>
                      </div>
                      <span className="num">€{fmt(totalACobrar(f))}</span>
                      <button type="button" className="tick" onClick={() => marcarCobrada(f)} title="Marcar como cobrada" aria-label={`Marcar como cobrada: ${f.cliente}`}><Icon.check /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

          </div>
          )
        })()}

        {/* Finanzas › Patrimonio (rediseño, fase 5): cifras, evolución, dónde está el dinero, ingresos y gastos,
            ingresos por marca, presupuesto e impuestos. Con los mismos datos que ya carga el hub; solo lee. */}
        {tab === 'patrimonio' && (() => {
          const pago = proximoPago(facturasFiscales, compras, cuotaAutonomo, impuestosReales)
          const hoyISO = hoyLocal()
          const pct = (n: number) => totalPatrimonio > 0 ? `${Math.round(n / totalPatrimonio * 100)} %` : '—'
          // Hace un año: el primer punto guardado desde entonces (o el más antiguo, si aún no hay un año).
          const haceUnAno = (() => { const d = new Date(hoyISO + 'T00:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })()
          const orden = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha))
          const base = orden.find(x => x.fecha >= haceUnAno) || orden[0]
          const delta12 = base ? totalPatrimonio - Number(base.total) : null
          // Dónde está el dinero: cada cuenta con sus apartados dentro, y la cripto.
          const grupos = [
            ...cuentas.filter(c => !c.padre_id).map(c => {
              const hijos = cuentas.filter(h => h.padre_id === c.id)
              return { clave: `c${c.id}`, nombre: c.nombre, color: c.color, total: aEuros(c) + hijos.reduce((t, h) => t + aEuros(h), 0), detalle: hijos.map(h => `${h.nombre} €${fmt(aEuros(h))}`).join(' · '), usd: c.moneda === 'USD' }
            }),
            ...(totalCrypto > 0 ? [{ clave: 'crypto', nombre: 'Cripto', color: '#8A8A87', total: totalCrypto, detalle: crypto.map(c => `${c.cantidad} ${c.symbol}`).join(' · '), usd: false }] : []),
          ].sort((a, b) => b.total - a.total)
          const mayor = Math.max(1, ...grupos.map(g => g.total))
          // Ingresos y gastos por mes (movimientos del banco): cobros e ingresos frente a gastos menos reembolsos.
          const meses6 = ultimosMeses(6)
          const porMes = meses6.map(m => {
            const del = movsBanco.filter(x => x.fecha.slice(0, 7) === m)
            const ingresos = del.filter(x => (x.clase === 'cobro' || x.clase === 'ingreso') && x.importe > 0).reduce((t, x) => t + Number(x.importe), 0)
            const gastos = del.filter(x => x.clase === 'gasto' && x.importe < 0).reduce((t, x) => t - Number(x.importe), 0) - del.filter(x => x.clase === 'reembolso' && x.importe > 0).reduce((t, x) => t + Number(x.importe), 0)
            return { m, ingresos, gastos: Math.max(0, gastos) }
          })
          const tope = Math.max(1, ...porMes.flatMap(x => [x.ingresos, x.gastos]))
          const irpf = cuentas.find(c => c.tipo === 'irpf')
          return (
          <div className="col pt">
            <section className="fx__kpis" aria-label="Resumen del patrimonio">
              <div className="fx__kpi"><span className="fx__l">Patrimonio total</span><span className="fx__v">€{fmt(totalPatrimonio)}</span><span className="fx__s">{deltaMes !== null ? `${deltaMes >= 0 ? '+' : '−'}€${fmt(Math.abs(deltaMes))} desde el mes pasado` : 'Registrando historial'}</span></div>
              <div className="fx__kpi"><span className="fx__l">Liquidez</span><span className="fx__v">€{fmt(totalLiquidez)}</span><span className="fx__s">{pct(totalLiquidez)} del total</span></div>
              <div className="fx__kpi"><span className="fx__l">Cripto</span><span className="fx__v">€{fmt(totalCrypto)}</span><span className="fx__s">{pct(totalCrypto)} del total</span></div>
              <div className="fx__kpi"><span className="fx__l">En 12 meses</span><span className="fx__v">{delta12 === null ? '—' : `${delta12 >= 0 ? '+' : '−'}€${fmt(Math.abs(delta12))}`}</span><span className="fx__s">{base ? `desde el ${fmtDate(base.fecha)}${Number(base.total) > 0 && delta12 !== null ? ` · ${delta12 >= 0 ? '+' : ''}${(delta12 / Number(base.total) * 100).toFixed(1)} %` : ''}` : 'Sin historial'}</span></div>
            </section>

            <section className="fx__card" aria-labelledby="pt-evo">
              <header><h2 id="pt-evo">Evolución del patrimonio</h2><span className="caps dim">un punto por día</span></header>
              <PatrimonioEvolucion snapshots={snapshots} actual={totalPatrimonio} hoy={hoyISO} />
            </section>

            <div className="pt__g">
              <section className="fx__card" aria-labelledby="pt-donde">
                <header><h2 id="pt-donde">Dónde está el dinero</h2><span className="caps dim">€{fmt(totalPatrimonio)}</span></header>
                <ul className="pt__barras">
                  {grupos.map(g => (
                    <li key={g.clave}>
                      <span className="pt__bn"><i style={{ background: g.color || 'var(--muted)' }} />{g.nombre}{g.usd && <small className="dim"> · USD</small>}</span>
                      <span className="num">€{fmt(g.total)} <small className="dim">{pct(g.total)}</small></span>
                      <span className="pt__tr"><i style={{ width: `${g.total / mayor * 100}%` }} /></span>
                      {g.detalle && <small className="pt__det">{g.detalle}</small>}
                    </li>
                  ))}
                </ul>
                <button type="button" className="copy caps" onClick={() => setModal({ type: 'editCuentas' })}>Editar cuentas →</button>
              </section>

              <section className="fx__card" aria-labelledby="pt-ig">
                <header><h2 id="pt-ig">Ingresos y gastos</h2><span className="caps dim">últimos 6 meses · banco</span></header>
                {movsBanco.length === 0 ? <p className="nota">Sin movimientos del banco todavía.</p> : <>
                  <div className="pt__cols" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
                    {porMes.map(x => (
                      <div key={x.m} className="pt__mes" title={`${fmtMes(x.m)}: ingresos €${fmt(x.ingresos)}, gastos €${fmt(x.gastos)}`}>
                        <div className="pt__par"><i className="pt__in" style={{ height: `${x.ingresos / tope * 100}%` }} /><i className="pt__ga" style={{ height: `${x.gastos / tope * 100}%` }} /></div>
                        <span className="caps dim">{fmtMes(x.m)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="legend caps pt__ley"><span><i className="sw" />Ingresos €{fmt(porMes.reduce((t, x) => t + x.ingresos, 0))}</span><span><i className="sw sw--g" />Gastos €{fmt(porMes.reduce((t, x) => t + x.gastos, 0))}</span></p>
                </>}
              </section>
            </div>

            {/* Impuestos del trimestre: lo que toca pagar y lo apartado para ello */}
            {pago && (
              <Link href="/finanzas/impuestos" className="pt__imp">
                <span className="caps dim">Impuestos · T{pago.q}</span>
                <span><b>€{fmt2(pago.total)}</b> {pago.declarado ? 'del gestor' : pago.cerrado ? 'a pagar' : 'estimado'} · hasta el {fmtDate(pago.plazo)}</span>
                {irpf && <span className={Number(irpf.saldo) >= pago.total ? 'ok' : 'aviso'}>Apartado IRPF €{fmt(aEuros(irpf))}{Number(irpf.saldo) >= pago.total ? ' · cubierto' : ` · faltan €${fmt(pago.total - aEuros(irpf))}`}</span>}
                <span className="caps dim">Impuestos →</span>
              </Link>
            )}

            <section className="block" aria-label="Ingresos facturados por mes de emisión">
              <p className="label caps"><span>Ingresos facturados</span><i className="rule" /></p>
              <IngresosChart facturas={facturasFiscales} />
              <p className="legend caps"><span><i className="sw" />Cobrado</span><span><i className="sw sw--p" />Pendiente</span></p>
            </section>

            <div className="duo">
              <CuentasCard cuentas={cuentas} aEuros={aEuros} fijosMes={fijos.reduce((t, i) => t + Number(i.limite), 0)}
                variablesMes={variables.reduce((t, i) => t + Number(i.limite), 0)} pago={pago}
                porCobrar={totalPendiente} onEdit={() => setModal({ type: 'editCuentas' })}
                fijosPendientes={movsBanco.length ? (() => { const g = gastadoPorPartida(movsBanco, undefined, undefined, compartidos); return fijos.reduce((t, i) => t + Math.max(0, Number(i.limite) - (g[i.nombre] || 0)), 0) })() : null}
                extra={crypto.map(c => ({ key: `crypto-${c.id}`, titulo: `${c.cantidad} ${c.symbol}`, linea: `€${fmt2(ethPrice)} / ${c.symbol} · precio en vivo`, monto: `€${fmt(c.symbol === 'ETH' ? c.cantidad * ethPrice : 0)}` }))} />
              {marcasLista.length > 0 && <MarcaCard facturas={demoMarcas ? DEMO_FACTURAS : facturas} proyectos={demoMarcas ? [] : proyectos} marcas={marcasLista} demo={demoMarcas} />}
            </div>

            <PresupuestoCards fijos={fijos} variables={variables} movimientos={movsBanco} compartidos={compartidos} />
          </div>
          )
        })()}

        {/* Facturas: pendientes arriba; debajo, las cobradas con sus filtros. Cada factura, una fila que se despliega. */}
        {tab === 'facturas' && (() => {
          const verHref = (f: Factura) => f.archivo_path ? `/api/facturas/archivo?id=${f.id}` : `/invoice/${f.id}`
          // Las más recientes por fecha de cobro (o de emisión si no la tiene).
          const cobradas = facturasCobradas.filter(enFiltro).sort((a, b) => (b.fecha_cobro || b.fecha).localeCompare(a.fecha_cobro || a.fecha) || b.fecha.localeCompare(a.fecha))
          return (
            <div className="col">
              <section className="block" aria-label="Pendientes">
                <p className="label caps"><span>Pendientes · {facturasPendientes.length}</span><i className="rule" /></p>
                {facturasPendientes.length === 0 ? <p className="empty">No hay facturas pendientes.</p> : (
                  <ul className="projs focus">
                    {facturasPendientes.map(f => (
                      <FilaFactura key={f.id} f={f} trim={trimDe(f.fecha)} fueraDeOrden={fueraDeOrden.has(f.id)} href={verHref(f)}
                        onCobrar={() => marcarCobrada(f)} onBorrar={() => deleteFactura(f.id)} />
                    ))}
                  </ul>
                )}
              </section>

              <section className="block" aria-label="Cobradas">
                <p className="label caps">
                  <span>Cobradas · {cobradas.length}</span><i className="rule" />
                  <span className="label__m" title="Lo cobrado (con IVA y retención en los clientes de España)">€{fmt(cobradas.reduce((s, f) => s + totalACobrar(f), 0))}</span>
                </p>
                <div className="filt">
                  <span className="seg caps" role="group" aria-label="Año">
                    {aniosFacturas.map(a => <button key={a} type="button" aria-pressed={a === filtroAnio} onClick={() => setFiltroAnio(a)}>{a}</button>)}
                  </span>
                  <span className="seg caps" role="group" aria-label="Trimestre">
                    {[0, 1, 2, 3, 4].map(q => <button key={q} type="button" aria-pressed={q === filtroTrim} onClick={() => setFiltroTrim(q)}>{q ? `T${q}` : 'Todo'}</button>)}
                  </span>
                </div>
                {cobradas.length === 0 ? <p className="empty">No hay facturas cobradas en este período.</p> : (
                  <ul className="projs focus">
                    {cobradas.map(f => (
                      <FilaFactura key={f.id} f={f} trim={trimDe(f.fecha)} fueraDeOrden={fueraDeOrden.has(f.id)} href={verHref(f)}
                        onBorrar={() => deleteFactura(f.id)} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )
        })()}

        {/* Clientes Tab */}
        {tab === 'clientes' && (
          <div className="col">
            <section className="block" aria-label="Clientes">
              <p className="label caps"><span>Clientes</span><i className="rule" /><span className="label__m">{clientesFiscales.length}</span></p>
              {clientesFiscales.length === 0 ? <p className="empty">No hay clientes con datos fiscales cargados todavía.</p> : (
                <ul className="projs focus">
                  {clientesFiscales.map(c => (
                    <FilaCliente key={c.cliente} c={c} onEditar={() => setModal({ type: 'editCliente', data: { cliente: c } })} onBorrar={() => deleteClienteFiscal(c.cliente)} />
                  ))}
                </ul>
              )}
              <p className="nota">Estos datos se usan para generar el PDF de cada factura.</p>
            </section>
          </div>
        )}

        {tab === 'compras' && <ComprasTab compras={compras} reload={loadData} />}

        {tab === 'impuestos' && (
          <ImpuestosTab facturas={facturasFiscales} compras={compras} cuotaMensual={cuotaAutonomo} onSaveCuota={async n => {
            await supabase.from('configuracion').upsert({ clave: 'cuota_autonomo_mensual', valor: String(n) })
            setCuotaAutonomo(n)
          }} reales={impuestosReales} onSaveReal={async (anio, q, valor) => {
            await supabase.from('configuracion').upsert({ clave: claveReal(anio, q), valor: JSON.stringify(valor) })
            setImpuestosReales(prev => ({ ...prev, [`${anio}-${q}`]: valor }))
          }} />
        )}

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

        {tab === 'compartidos' && <CompartidosVista />}
        {tab === 'bancos' && <BancosTab cuentas={cuentas} mensaje={mensajeBanco} reload={loadData} />}

        {/* Webs: una pestaña por marca de precio cerrado. Treatments: un bloque por cliente o grupo, cada uno con su link. */}
        {marcaActiva && <MarcaTab key={marcaActiva.key} abrir={abrirProyecto} marca={marcaActiva} proyectos={proyectosAgencia} demo={demoMarcas}
          numerosExistentes={facturas.map(f => f.numero)} clientes={clientesFiscales} acciones={demoMarcas ? undefined : accionesAgencia} />}
        {marcaTsActiva && gruposMarcaTs.length === 0 && (
          <p className="empty">Todavía no hay proyectos en {marcaTsActiva.nombre}. Crea uno con «Nuevo proyecto».</p>
        )}
        {marcaTsActiva && gruposMarcaTs.length > 0 && (
          <div className="col">
            <ResumenTreatments marca={marcaTsActiva.key} proyectos={proyectosMarcaTs} facturas={facturas} dias={dias} clientesFiscales={clientesFiscales}
              marcaDeFactura={f => f.marca || (() => { const p = proyectos.find(x => x.id === f.proyecto_id); return p ? marcaTsDe(p) : '' })()} />
            {/* Un bloque por cliente o grupo, cada uno con su link; con un solo grupo, el nombre ya está en el título */}
            {gruposMarcaTs.map(g => (
              <TimesheetTab key={g.key} abrir={abrirProyecto} grupo={g} etiqueta={gruposMarcaTs.length > 1 ? g.label : 'Proyectos'} proyectos={proyectosMarcaTs} dias={dias} facturas={facturas} clientesFiscales={clientesFiscales} reload={loadData} />
            ))}
          </div>
        )}

        {/* Modals */}
        {modal && (
          <div className="modal-bg" onClick={() => setModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              {modal.type === 'addGasto' && (
                <ModalAddGasto item={modal.data.item} tabla={modal.data.tabla} onAdd={addGasto} onClose={() => setModal(null)} />
              )}
              {modal.type === 'editLimite' && (
                <ModalEditLimite item={modal.data.item} tabla={modal.data.tabla} onSave={editLimite} onClose={() => setModal(null)} />
              )}
              {modal.type === 'editCuentas' && (
                <ModalEditCuentas cuentas={cuentas} automaticas={cuentasBanco} onUpdate={updateCuenta} onClose={() => { setModal(null); loadData() }} />
              )}
              {modal.type === 'addProyecto' && (
                <ModalAddProyecto clienteInicial={marcaTsActiva?.key === 'ab' ? 'Ambushed' : undefined} onAdd={addProyecto} onClose={() => setModal(null)} />
              )}
              {modal.type === 'editCliente' && (
                <ModalCliente cliente={modal.data?.cliente} onSave={saveClienteFiscal} onClose={() => setModal(null)} />
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

// Pasa las insignias al marco cuando cambian (va como componente porque se calculan después de cargar).
function PublicarInsignias({ insignias }: { insignias: Record<string, number> }) {
  const publicar = usePublicarMarco()
  const clave = JSON.stringify(insignias)
  useEffect(() => { publicar({ insignias: JSON.parse(clave) }) }, [publicar, clave])
  return null
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

function ModalEditCuentas({ cuentas, automaticas, onUpdate, onClose }: { cuentas: Cuenta[], automaticas: number[], onUpdate: (id: number, patch: Partial<Cuenta>) => Promise<void>, onClose: () => void }) {
  const [values, setValues] = useState<{ [id: number]: string }>(Object.fromEntries(cuentas.map(c => [c.id, String(c.saldo)])))
  const [rent, setRent] = useState<{ [id: number]: string }>(Object.fromEntries(cuentas.map(c => [c.id, c.rentabilidad_anual != null ? String(c.rentabilidad_anual) : ''])))
  // Cada cuenta seguida de sus apartados.
  const ordenadas = cuentas.filter(c => !c.padre_id).flatMap(c => [c, ...cuentas.filter(h => h.padre_id === c.id).sort((a, b) => a.orden - b.orden)])
  const campo = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
  // Las que actualiza el banco (y el apartado de ahorro, que es lo que sobra
  // del total del banco) no se editan; solo se guarda lo que cambió.
  const auto = (c: Cuenta) => automaticas.includes(c.id) || (c.tipo === 'ahorro' && !!c.padre_id && automaticas.includes(c.padre_id))
  const guardar = async () => {
    await Promise.all(ordenadas.flatMap(c => {
      const patch: Partial<Cuenta> = {}
      if (!auto(c) && Number(values[c.id]) !== Number(c.saldo)) patch.saldo = Number(values[c.id])
      if (c.tipo === 'inversion') {
        const r = rent[c.id] === '' ? null : Number(rent[c.id])
        if (r !== (c.rentabilidad_anual != null ? Number(c.rentabilidad_anual) : null)) patch.rentabilidad_anual = r
      }
      return Object.keys(patch).length ? [onUpdate(c.id, patch)] : []
    }))
    onClose()
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Editar saldos <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      {ordenadas.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: c.padre_id ? 18 : 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: c.padre_id ? 'var(--text3)' : 'var(--text2)' }}>
            {c.padre_id ? `Apartado · ${c.nombre}` : c.tipo === 'operativa' && cuentas.some(h => h.padre_id === c.id) ? `${c.nombre} · disponible` : c.nombre}
          </span>
          {c.tipo === 'inversion' && (
            <input type="number" step="0.01" value={rent[c.id]} onChange={e => setRent({ ...rent, [c.id]: e.target.value })} placeholder="% anual" title="Rentabilidad anual (%)" style={{ ...campo, width: 72 }} />
          )}
          {auto(c)
            ? <span title={c.tipo === 'ahorro' ? 'Se calcula solo: total del banco − disponible − otros apartados' : 'Se actualiza solo desde el banco'} style={{ ...campo, width: 110, color: 'var(--text3)', display: 'inline-flex', justifyContent: 'space-between' }}><span className="mono">{fmt2(c.saldo)}</span><span style={{ fontSize: 10 }}>auto</span></span>
            : <input type="number" value={values[c.id]} onChange={e => setValues({ ...values, [c.id]: e.target.value })} style={{ ...campo, width: 110 }} />}
        </div>
      ))}
      <button onClick={guardar}
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
  // Si el país no se eligió a mano, se sugiere a partir del identificador y la dirección.
  const [paisElegido, setPaisElegido] = useState<PaisFiscal | null>(cliente?.pais || null)
  const pais = paisElegido || detectarPais(identificador, direccion)
  // Campos de una sola línea y botones de la web (mismo estado y mismo guardado que antes).
  return (
    <>
      <div className="modal__head"><h2>{cliente ? `Editar cliente · ${cliente.cliente}` : 'Nuevo cliente'}</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
      <div className="modal__campos">
        <div className="field">
          <label className="caps" htmlFor="cf-nombre">Nombre del cliente</label>
          <input id="cf-nombre" value={nombre} disabled={!!cliente} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ambushed, Hans Emanuel Productions..." />
          {cliente && <p className="nota field__nota">El nombre no se puede cambiar aquí porque es lo que vincula este cliente con sus facturas.</p>}
        </div>
        <div className="field">
          <label className="caps" htmlFor="cf-id">Identificador fiscal · NIF/CIF, VAT, teléfono…</label>
          <input id="cf-id" value={identificador} onChange={e => setIdentificador(e.target.value)} placeholder="Ej: 12810068 · VAT 12810068 · 07752660689" />
        </div>
        <div className="field">
          <label className="caps" htmlFor="cf-dir">Dirección fiscal</label>
          <textarea id="cf-dir" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, número&#10;Ciudad, país" rows={3} />
        </div>
        <div className="field">
          <label className="caps" htmlFor="cf-pais">País fiscal · define el formato de sus facturas</label>
          <span className="field__sel">
            <select id="cf-pais" value={pais || ''} onChange={e => setPaisElegido((e.target.value || null) as PaisFiscal | null)}>
              <option value="">Sin definir (sin IVA)</option>
              {PAISES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <Chevron />
          </span>
          {!paisElegido && pais && <p className="nota field__nota">Detectado automáticamente por la dirección / identificador.</p>}
        </div>
      </div>
      <div className="modal__foot">
        <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
        <button type="button" className="pill pill--sm" onClick={() => nombre && onSave({ cliente: nombre, identificador, direccion, pais })}>Guardar</button>
      </div>
    </>
  )
}

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
const cancelBtnStyle = { padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }
const confirmBtnStyle = { flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }

// Estado de cada proyecto y de cada día, con su punto: verde = activo o hecho, ámbar = por facturar o en curso.
const ESTADO_PROYECTO: Record<string, [string, string]> = { activo: ['Activo', 'dot--green'], completado: ['Completado', 'dot--wait'], facturado: ['Facturado', 'dot--off'] }
const ESTADO_DIA: Record<string, [string, string]> = { pendiente: ['Pendiente', 'dot--off'], en_progreso: ['En progreso', 'dot--wait'], hecho: ['Hecho', 'dot--ok'] }
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

// Una factura: cliente · concepto, una línea pequeña (número y la fecha que importa), importe y el punto
// de estado. Al desplegar: el desglose, las fechas, el origen y las acciones de siempre.
function FilaFactura({ f, trim, fueraDeOrden, href, onCobrar, onBorrar }: { f: Factura, trim: number, fueraDeOrden: boolean, href: string, onCobrar?: () => void, onBorrar: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const pendiente = f.estado === 'pendiente'
  const d = desgloseFactura(f)
  const [estado, punto] = pendiente ? ['Pendiente', 'dot--wait'] : ['Cobrada', 'dot--ok']
  const origen = f.origen === 'historico' ? 'Factura ya declarada, con su PDF original'
    : f.origen === 'regularizacion' ? 'Cobro de 2024-2025 facturado a posteriori' : null
  return (
    <li className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--fa" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="fa__t">{f.cliente}{f.descripcion ? <span> · {f.descripcion}</span> : null}</span>
        <span className="p__s caps">
          {f.numero ? `${f.numero} · ` : ''}{pendiente ? `Vence ${fmtDate(f.fecha_vencimiento || f.fecha)}` : f.fecha_cobro ? `Cobrada ${fmtDate(f.fecha_cobro)}` : `Emitida ${fmtDate(f.fecha)}`}
          {fueraDeOrden && <> · <span className="aviso" title="La fecha no sigue el orden de su número: revisala">fuera de orden</span></>}
        </span>
        <span className="p__v num">€{fmt(totalACobrar(f))}</span>
        <span className="st" title={estado}><i className={`dot ${punto}`} aria-hidden="true" /><span className="sr">{estado}</span></span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          <div className="fd">
            {d ? (
              <dl className="desg">
                <div><dt>Base</dt><dd className="num">€{fmt2(d.base)}</dd></div>
                <div><dt>IVA 21 %</dt><dd className="num">+€{fmt2(d.iva)}</dd></div>
                <div><dt>Retención IRPF 15 %</dt><dd className="num">−€{fmt2(d.ret)}</dd></div>
                <div className="desg__t"><dt>{pendiente ? 'A cobrar' : 'Cobrado'}</dt><dd className="num">€{fmt2(d.total)}</dd></div>
              </dl>
            ) : <span />}
            <dl className="meta">
              <div><dt>Emitida</dt><dd>{fmtDate(f.fecha)} {f.fecha.slice(0, 4)} · T{trim}</dd></div>
              <div><dt>Vence</dt><dd>{fmtDate(f.fecha_vencimiento || f.fecha)}</dd></div>
              {f.fecha_cobro && <div><dt>Cobrada</dt><dd>{fmtDate(f.fecha_cobro)}</dd></div>}
              {origen && <div><dt>Origen</dt><dd>{origen}</dd></div>}
              {fueraDeOrden && <div><dt>Aviso</dt><dd className="aviso">La fecha no sigue el orden de su número: revisala</dd></div>}
            </dl>
          </div>
          <div className="p__foot">
            {onCobrar && <button type="button" className="pill pill--sm" onClick={onCobrar}><Icon.check />Marcar como cobrada</button>}
            <span className="foot__r">
              <a className="copy caps" href={href} target="_blank" rel="noopener noreferrer">Ver factura →</a>
              <button type="button" className="copy caps borrar" onClick={onBorrar}>Borrar</button>
            </span>
          </div>
        </div>
      )}
    </li>
  )
}

// Resumen de una pestaña de Treatments, como el de Webs: lo cobrado del año en grande, lo pendiente al lado, una línea fina
// (cobrado, pendiente, por facturar) y lo que falta facturar. Cobrado y pendiente siguen la regla de «Por marca» del Overview
// (año en curso, sin los registros internos, importe a cobrar); por facturar suma los proyectos activos y completados,
// con IVA y retención si el cliente es de España (el mismo importe que su fila).
function ResumenTreatments({ marca, proyectos, facturas, dias, clientesFiscales, marcaDeFactura }: {
  marca: string, proyectos: Proyecto[], facturas: Factura[], dias: DiaTrabajado[], clientesFiscales: ClienteFiscal[], marcaDeFactura: (f: Factura) => string
}) {
  const anio = new Date().getFullYear()
  let cobrado = 0, pendiente = 0, porFacturar = 0
  for (const f of facturas) {
    if (f.fiscal === false || !f.fecha || Number(f.fecha.slice(0, 4)) !== anio || marcaDeFactura(f) !== marca) continue
    if (f.estado === 'cobrada') cobrado += totalACobrar(f); else pendiente += totalACobrar(f)
  }
  for (const p of proyectos) {
    if (p.status === 'facturado') continue
    const base = dias.filter(d => d.proyecto_id === p.id).reduce((s, d) => s + Number(d.total_day), 0)
    porFacturar += desglose(base, clientesFiscales.find(c => c.cliente === p.cliente)?.pais === 'ES')?.total ?? base
  }
  const segmentos = ([[cobrado, 'var(--green)'], [pendiente, 'var(--amber)'], [porFacturar, 'var(--dim)']] as const).filter(([v]) => v > 0)
  return (
    <section className="block" aria-label="Resumen">
      <p className="label caps"><span>Cobrado</span><i className="rule" /><span className="label__m">{anio}</span></p>
      <div className="hero">
        <p className="big">€{fmt(cobrado)}</p>
        <p className="delta caps"><span>€{fmt(pendiente)}</span><span>pendiente</span></p>
      </div>
      <div className="stack" aria-hidden="true">{segmentos.map(([v, c], k) => <i key={k} style={{ flex: v, background: c }} />)}</div>
      <dl className="split"><div><dt className="caps">Por facturar</dt><dd><span className="num">€{fmt(porFacturar)}</span></dd></div></dl>
    </section>
  )
}

// Un cliente fiscal: nombre, identificador y país; al desplegar, lo que sale en el PDF de sus facturas y las acciones
function FilaCliente({ c, onEditar, onBorrar }: { c: ClienteFiscal, onEditar: () => void, onBorrar: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const pais = c.pais === 'ES' ? 'España' : c.pais === 'UE' ? 'UE' : c.pais === 'EXT' ? 'Fuera UE' : null
  const formato = c.pais ? PAISES.find(x => x.value === c.pais)?.label : 'Sin país: sus facturas salen sin IVA. Edítalo para elegirlo.'
  return (
    <li className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--cli" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="p__main">
          <span className="p__n">{c.cliente}</span>
          <span className="p__s caps">{c.identificador || 'Sin identificador fiscal'}</span>
        </span>
        <span className={`st caps${pais ? '' : ' aviso'}`} title={formato}>{!pais && <i className="dot dot--wait" aria-hidden="true" />}{pais || 'Sin país'}</span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          <dl className="meta meta--cli">
            <div><dt>Identificador</dt><dd className={c.identificador ? undefined : 'aviso'}>{c.identificador || 'Sin identificador fiscal'}</dd></div>
            <div><dt>Dirección</dt><dd className={c.direccion ? undefined : 'aviso'}>{c.direccion ? c.direccion.replace(/\n/g, ', ') : 'Sin dirección'}</dd></div>
            <div><dt>Facturas</dt><dd className={c.pais ? undefined : 'aviso'}>{formato}</dd></div>
          </dl>
          <div className="p__foot">
            <button type="button" className="ghost" onClick={onEditar}><Icon.edit />Editar datos</button>
            <button type="button" className="copy caps borrar" onClick={onBorrar}>Borrar</button>
          </div>
        </div>
      )}
    </li>
  )
}


function TimesheetTab({ abrir, grupo, etiqueta, proyectos, dias, facturas, clientesFiscales, reload }: { abrir?: number | null, grupo: GrupoTimesheet, etiqueta: string, proyectos: Proyecto[], dias: DiaTrabajado[], facturas: Factura[], clientesFiscales: ClienteFiscal[], reload: () => void }) {
  const [modal, setModal] = useState<Modal>(null)
  const [expandido, setExpandido] = useState<number | null>(abrir ?? null)
  const [token, setToken] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [clienteFiltro, setClienteFiltro] = useState('todos')

  const link = linkPublico(grupo)
  useEffect(() => {
    supabase.from('configuracion').select('valor').eq('clave', link.tokenKey).maybeSingle()
      .then(({ data }) => setToken(data?.valor || ''))
  }, [link.tokenKey])

  // El token del link se crea la primera vez que se copia.
  const copiarLink = () => {
    const t = token || crypto.randomUUID()
    navigator.clipboard.writeText(`${window.location.origin}/${link.ruta}/${t}`).catch(() => {})
    if (!token) {
      setToken(t)
      supabase.from('configuracion').upsert({ clave: link.tokenKey, valor: t }).then(() => {})
    }
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 1800)
  }

  const diasDe = (proyectoId: number) => dias.filter(d => d.proyecto_id === proyectoId).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const totalProyecto = (proyectoId: number) => diasDe(proyectoId).reduce((s, d) => s + Number(d.total_day), 0)
  // Horas trabajadas y de stand by del proyecto (solo los que van por hora).
  const horasProyecto = (proyectoId: number) => diasDe(proyectoId).reduce((t, d) => ({ hrs: t.hrs + Number(d.hrs || 0), sb: t.sb + Number(d.standby_hrs || 0) }), { hrs: 0, sb: 0 })
  const fmtHoras = (h: number) => `${Number(h.toFixed(2))}h`
  const ultimaFecha = (proyectoId: number) => {
    const ds = diasDe(proyectoId)
    return ds.length ? ds[ds.length - 1].fecha : ''
  }

  const proyectosFiltrados = proyectos
    .filter(p => grupo.clientes.includes(p.cliente))
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

  // Cambia el cliente del proyecto y, si ya tiene factura, también el de la
  // factura y su formato (IVA/retención según el país del nuevo cliente).
  const cambiarCliente = async (p: Proyecto, cliente: string) => {
    const factura = facturas.find(f => f.proyecto_id === p.id)
    if (factura && !confirm(`"${p.nombre}" ya tiene la factura ${factura.numero || ''}. También va a pasar a ${cliente}. ¿Confirmás?`)) return
    await supabase.from('proyectos').update({ cliente, tipo: tipoLegacy(cliente) }).eq('id', p.id)
    if (factura) {
      const pais = clientesFiscales.find(c => c.cliente === cliente)?.pais
      await supabase.from('facturas').update({ cliente, tipo_factura: tipoFacturaDePais(pais) }).eq('id', factura.id)
    }
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

  // Como la web: un bloque por grupo con su link público; cada proyecto, una fila que se despliega en su timesheet.
  return (
    <section className="block" aria-label={grupo.label}>
      <p className="label caps">
        <span>{etiqueta}</span><i className="rule" />
        <button type="button" className="label__m copy" onClick={copiarLink} title={`Link público de solo lectura para ${grupo.label}`}>{linkCopiado ? 'Link copiado ✓' : `/${link.ruta}/ · Copiar link`}</button>
      </p>

      {grupo.clientes.length > 1 && (
        <label className="sel caps">
          <span className="sr">Cliente</span>
          <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)}>
            <option value="todos">Todos los clientes</option>
            {grupo.clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Chevron />
        </label>
      )}

      {proyectosFiltrados.length === 0 ? <p className="empty">No hay proyectos todavía.</p> : (
        <ul className="projs focus">
          {proyectosFiltrados.map(p => {
            const total = totalProyecto(p.id)
            const horas = p.modo_rate === 'hora' ? horasProyecto(p.id) : null
            // Clientes de España: el total lleva IVA 21 % y retención 15 % encima de la base.
            const imp = desglose(total, clientesFiscales.find(c => c.cliente === p.cliente)?.pais === 'ES')
            const isOpen = expandido === p.id
            const ds = diasDe(p.id)
            const factura = p.status === 'facturado' ? facturas.find(f => f.proyecto_id === p.id) : undefined
            // Horas y stand by en nodos de texto separados, como antes: el modo privado tapa las horas sueltas.
            const cantidad = horas && horas.hrs + horas.sb > 0 ? <>{fmtHoras(horas.hrs)}{horas.sb > 0 ? ` · SB ${fmtHoras(horas.sb)}` : ''}</> : p.modo_rate === 'hora' ? 'por hora' : 'por día'
            const [estado, punto] = ESTADO_PROYECTO[p.status] || [p.status, 'dot--off']
            return (
              <li key={p.id} id={`proyecto-${p.id}`} className={`p${isOpen ? ' is-open' : ''}`}>
                <button type="button" className="p__head" aria-expanded={isOpen} onClick={() => setExpandido(isOpen ? null : p.id)}>
                  <span className="p__main">
                    <span className="p__n">{p.nombre}</span>
                    <span className="p__s caps">{p.cliente} · {cantidad}{p.numero_proyecto ? ` · ${p.numero_proyecto}` : ''}</span>
                  </span>
                  <span className="p__v num" title={imp ? `Base €${fmt2(imp.base)} + IVA 21 % €${fmt2(imp.iva)} − retención 15 % €${fmt2(imp.ret)}` : undefined}>€{imp ? fmt2(imp.total) : fmt(total)}</span>
                  <span className="st caps"><i className={`dot ${punto}`} aria-hidden="true" />{estado}</span>
                  <Chevron />
                </button>

                {isOpen && (
                  <div className="p__body">
                    <ul className="dias">
                      {ds.length === 0 && <li className="dias__vacio">Sin días cargados.</li>}
                      {ds.map(d => {
                        const [estadoDia, puntoDia] = ESTADO_DIA[d.status] || [d.status, 'dot--off']
                        return (
                          <li key={d.id} className="d">
                            <button type="button" className="d__btn" onClick={() => setModal({ type: 'editDia', data: { dia: d, porHora: p.modo_rate === 'hora' } })} title="Editar día">
                              <span className="d__f caps">{fmtDate(d.fecha)}</span>
                              <span className="d__q">{d.hrs != null ? `${d.hrs}h × €${d.rate}${d.standby_hrs > 0 ? ` · SB ${d.standby_hrs}h` : ''}` : `€${d.rate}/día`}</span>
                              <span className="num">€{fmt2(d.total_day)}</span>
                              <span className="d__st" title={estadoDia}><i className={`dot ${puntoDia}`} aria-hidden="true" /><span className="sr">{estadoDia}</span></span>
                            </button>
                            <button type="button" className="d__x" onClick={() => deleteDia(d.id)} title="Borrar día" aria-label={`Borrar el día ${fmtDate(d.fecha)}`}><Icon.x /></button>
                          </li>
                        )
                      })}
                      {ds.length > 1 && (
                        <li className="d d--tot">
                          <span className="d__fila">
                            <span className="d__f caps">Total</span>
                            <span className="d__q">{horas ? `${fmtHoras(horas.hrs)}${horas.sb > 0 ? ` · SB ${fmtHoras(horas.sb)}` : ''}` : `${ds.length} días`}</span>
                            <span className="num">€{fmt2(total)}</span>
                            <span />
                          </span>
                          <span className="d__hueco" />
                        </li>
                      )}
                    </ul>

                    {imp && ds.length > 0 && (
                      <dl className="tax">
                        <div><dt>IVA 21 %</dt><dd className="num">+€{fmt2(imp.iva)}</dd></div>
                        <div><dt>Retención IRPF 15 %</dt><dd className="num">−€{fmt2(imp.ret)}</dd></div>
                        <div><dt>Total a cobrar</dt><dd className="num">€{fmt2(imp.total)}</dd></div>
                      </dl>
                    )}

                    <div className="p__foot">
                      <button type="button" className="add caps" onClick={() => setModal({ type: 'addDia', data: { proyectoId: p.id, porHora: p.modo_rate === 'hora' } })}><Icon.plus />Nuevo día</button>
                      <span className="foot__r">
                        {factura && <a className="copy caps" href={`/invoice/${factura.id}`} target="_blank" rel="noopener noreferrer" title="Ver/generar factura">{factura.numero || 'Factura'} →</a>}
                        <span className="seg caps" role="group" aria-label="Estado del proyecto">
                          {(['activo', 'completado', 'facturado'] as const).map(st => (
                            <button key={st} type="button" aria-pressed={p.status === st} onClick={() => { if (st !== p.status) cambiarStatus(p, st) }}>{ESTADO_PROYECTO[st][0]}</button>
                          ))}
                        </span>
                      </span>
                    </div>

                    <div className="p__meta caps">
                      <label className="p__campo">Cliente
                        <select value={p.cliente} onChange={e => cambiarCliente(p, e.target.value)} title="Cambiar cliente">
                          {!clientesFiscales.some(c => c.cliente === p.cliente) && <option value={p.cliente}>{p.cliente}</option>}
                          {clientesFiscales.map(c => <option key={c.cliente} value={c.cliente}>{c.cliente}</option>)}
                        </select>
                      </label>
                      <label className="p__campo">Ref.
                        <input
                          key={p.id + (p.numero_proyecto || '')}
                          defaultValue={p.numero_proyecto || ''}
                          placeholder="Nº de referencia"
                          onBlur={e => { if (e.target.value !== (p.numero_proyecto || '')) updateNumeroProyecto(p.id, e.target.value) }}
                        />
                      </label>
                      <button type="button" className="copy borrar" onClick={() => deleteProyecto(p.id)}>Borrar proyecto</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            {modal.type === 'addDia' && (
              <ModalAddDia porHora={modal.data.porHora} onAdd={(d: any) => addDia(modal.data.proyectoId, d)} onClose={() => setModal(null)} />
            )}
            {modal.type === 'editDia' && (
              <ModalAddDia porHora={modal.data.porHora} dia={modal.data.dia} onAdd={(d: any) => updateDia(modal.data.dia.id, d)} onClose={() => setModal(null)} />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function ModalAddProyecto({ clienteInicial, onAdd, onClose }: { clienteInicial?: string, onAdd: (d: NuevoProyecto) => void, onClose: () => void }) {
  const [nombre, setNombre] = useState('')
  const [numeroProyecto, setNumeroProyecto] = useState('')
  const [clientesGuardados, setClientesGuardados] = useState<{ cliente: string }[]>([])
  const [cliente, setCliente] = useState(clienteInicial || '')
  // Por defecto, por hora para Ambushed / BoldMove y fijo por día para el resto.
  const [modoElegido, setModoElegido] = useState<'hora' | 'dia' | null>(null)
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoIdentificador, setNuevoIdentificador] = useState('')
  const [nuevoDireccion, setNuevoDireccion] = useState('')

  useEffect(() => {
    supabase.from('clientes_fiscales').select('cliente').order('cliente').then(({ data }) => {
      if (data) setClientesGuardados(data)
      if (data && data.length > 0 && !data.some((c: { cliente: string }) => c.cliente === cliente)) {
        setCliente(data[0].cliente)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modo = modoElegido || (!nuevoCliente && grupoDeCliente(cliente).key === 'ab' ? 'hora' : 'dia')

  const crear = async () => {
    let clienteFinal = cliente
    if (nuevoCliente) {
      if (!nuevoNombre) return
      clienteFinal = nuevoNombre
      await supabase.from('clientes_fiscales').upsert({ cliente: nuevoNombre, identificador: nuevoIdentificador, direccion: nuevoDireccion, pais: detectarPais(nuevoIdentificador, nuevoDireccion) })
    }
    if (!nombre || !clienteFinal) return
    onAdd({ nombre, cliente: clienteFinal, numero_proyecto: numeroProyecto, modo_rate: modo })
  }

  // Campos de una sola línea y botones de la web (mismo estado y mismas acciones que antes).
  return (
    <>
      <div className="modal__head"><h2>Nuevo proyecto</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
      <div className="modal__campos">
        <div className="field">
          <label className="caps" htmlFor="np-nombre">Nombre del proyecto</label>
          <input id="np-nombre" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Verizon x FIFA World Cup" />
        </div>
        {!nuevoCliente ? (
          <div className="field">
            <label className="caps" htmlFor="np-cliente">Cliente</label>
            <select id="np-cliente" value={cliente} onChange={e => {
              if (e.target.value === '__nuevo__') { setNuevoCliente(true); return }
              setCliente(e.target.value)
            }}>
              {clientesGuardados.map(c => <option key={c.cliente} value={c.cliente}>{c.cliente}</option>)}
              <option value="__nuevo__">+ Nuevo cliente...</option>
            </select>
            <Chevron />
          </div>
        ) : (
          <>
            <div className="field">
              <label className="caps" htmlFor="np-nuevo">Cliente nuevo</label>
              <input id="np-nuevo" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="field">
              <label className="caps" htmlFor="np-id">Identificador</label>
              <input id="np-id" value={nuevoIdentificador} onChange={e => setNuevoIdentificador(e.target.value)} placeholder="Identificador (CIF/VAT/registro)" />
            </div>
            <div className="field">
              <label className="caps" htmlFor="np-dir">Dirección</label>
              <textarea id="np-dir" value={nuevoDireccion} onChange={e => setNuevoDireccion(e.target.value)} placeholder="Dirección" rows={2} />
            </div>
            <button type="button" className="copy caps modal__volver" onClick={() => setNuevoCliente(false)}>← Elegir cliente guardado</button>
          </>
        )}
        <div className="field">
          <span className="caps field__l">Rate</span>
          <span className="seg caps" role="group" aria-label="Rate">
            {([['hora', 'Por hora'], ['dia', 'Fijo por día']] as const).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModoElegido(m)}>{label}</button>
            ))}
          </span>
        </div>
        <div className="field">
          <label className="caps" htmlFor="np-ref">Nº de referencia (para el cliente, ej: 268)</label>
          <input id="np-ref" value={numeroProyecto} onChange={e => setNumeroProyecto(e.target.value)} placeholder="Ej: F260099" />
        </div>
      </div>
      <div className="modal__foot">
        <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
        <button type="button" className="pill pill--sm" onClick={crear}>Crear</button>
      </div>
    </>
  )
}

function ModalAddDia({ porHora, dia, onAdd, onClose }: { porHora: boolean, dia?: DiaTrabajado, onAdd: (d: any) => void, onClose: () => void }) {
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
      hrs: porHora ? Number(hrs || 0) : null,
      standby_hrs: porHora ? Number(standby || 0) : 0,
      status,
    })
  }

  return (
    <>
      <div className="modal__head"><h2>{dia ? 'Editar día' : 'Nuevo día'}</h2><button type="button" className="modal__x" onClick={onClose} aria-label="Cerrar">×</button></div>
      <div className="modal__campos">
        <div className="field">
          <label className="caps" htmlFor="nd-fecha">Fecha</label>
          <input id="nd-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="field">
          <label className="caps" htmlFor="nd-rate">{porHora ? 'Rate por hora (€)' : 'Rate por día (€)'}</label>
          <input id="nd-rate" type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" />
        </div>
        {porHora && (
          <div className="modal__par">
            <div className="field">
              <label className="caps" htmlFor="nd-hrs">Horas trabajadas</label>
              <input id="nd-hrs" type="number" value={hrs} onChange={e => setHrs(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label className="caps" htmlFor="nd-sb">Stand by hrs</label>
              <input id="nd-sb" type="number" value={standby} onChange={e => setStandby(e.target.value)} placeholder="0" />
            </div>
          </div>
        )}
        <div className="field">
          <label className="caps" htmlFor="nd-status">Status</label>
          <select id="nd-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="hecho">Hecho</option>
          </select>
          <Chevron />
        </div>
      </div>
      <div className="modal__foot">
        <button type="button" className="copy caps" onClick={onClose}>Cancelar</button>
        <button type="button" className="pill pill--sm" onClick={submit}>{dia ? 'Guardar' : 'Agregar'}</button>
      </div>
    </>
  )
}
