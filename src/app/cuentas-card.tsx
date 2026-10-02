'use client'

import type { Cuenta } from '@/lib/supabase'

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (1605 → 1.605).
const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...agrupar }).format(n)
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export type PagoImpuestos = { anio: number; q: number; plazo: string; cerrado: boolean; total: number }

type Ctx = { fijosMes: number; fijosPendientes: number | null; variablesMes: number; pago: PagoImpuestos | null; porCobrar: number }
type Estado = 'ok' | 'aviso' | 'neutro'
type Tile = { key: string; grupo: string; titulo: string; color: string; monto: string; linea: string; chip?: { texto: string; estado: Estado }; progreso?: number; extra?: { nombre: string; monto: string }[] }

// Qué cubre cada cuenta según su función (columna tipo).
function describir(c: Cuenta, ctx: Ctx): Pick<Tile, 'linea' | 'chip' | 'progreso'> {
  const saldo = Number(c.saldo)
  switch (c.tipo) {
    case 'operativa': {
      const objetivo = ctx.fijosPendientes ?? ctx.fijosMes
      const falta = objetivo - saldo
      return {
        linea: ctx.fijosPendientes !== null ? `Fijos por pagar este mes: €${fmt(objetivo)}` : `Fijos del mes: €${fmt(objetivo)}`,
        chip: objetivo <= 0.5 ? { texto: 'Fijos pagados', estado: 'ok' } : falta <= 0 ? { texto: 'Cubierto', estado: 'ok' } : { texto: `Faltan €${fmt2(falta)}`, estado: 'aviso' },
        progreso: objetivo > 0 ? saldo / objetivo : 1,
      }
    }
    case 'irpf': {
      if (!ctx.pago) return { linea: 'Sin pago trimestral pendiente', chip: { texto: 'Al día', estado: 'ok' } }
      const { q, plazo, cerrado, total } = ctx.pago
      const falta = total - saldo
      return {
        linea: `T${q}${cerrado ? '' : ' estimado'}: €${fmt2(total)} · hasta el ${fechaCorta(plazo)}`,
        chip: falta <= 0 ? { texto: 'Cubierto', estado: 'ok' } : { texto: `Faltan €${fmt2(falta)}`, estado: 'aviso' },
        progreso: total > 0 ? saldo / total : undefined,
      }
    }
    case 'ahorro': {
      const gastoMes = ctx.fijosMes + ctx.variablesMes
      const meses = gastoMes > 0 ? saldo / gastoMes : 0
      return {
        linea: `Gastos del mes: €${fmt(gastoMes)}`,
        chip: { texto: `${meses.toFixed(1).replace('.', ',')} meses de colchón`, estado: meses >= 3 ? 'ok' : meses >= 1 ? 'neutro' : 'aviso' },
      }
    }
    case 'inversion': {
      const r = Number(c.rentabilidad_anual || 0)
      return r
        ? { linea: `${String(r).replace('.', ',')}% anual · €${fmt(saldo * r / 100)}/año`, chip: { texto: `+€${fmt2(saldo * r / 100 / 12)}/mes`, estado: 'ok' } }
        : { linea: 'Inversión' }
    }
    case 'variable': {
      const hoy = new Date()
      const dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate() + 1
      return {
        linea: `de €${fmt(ctx.variablesMes)} · quedan ${dias} días`,
        chip: { texto: `€${fmt2(saldo / dias)}/día`, estado: 'neutro' },
        progreso: ctx.variablesMes > 0 ? saldo / ctx.variablesMes : undefined,
      }
    }
    default:
      return { linea: c.tipo }
  }
}

const ETIQUETA: Record<string, string> = { operativa: 'Disponible', ahorro: 'Ahorros', irpf: 'IRPF', inversion: 'Inversión', variable: 'Variables' }
// Icono de la app de cada banco (de su ficha en el App Store, en public/bancos).
const LOGO: Record<string, string> = { bbva: '/bancos/bbva-app.png', revolut: '/bancos/revolut-app.png', wise: '/bancos/wise-app.png' }

const COLOR_ESTADO: Record<Estado, string> = { ok: 'var(--green)', aviso: 'var(--amber)', neutro: 'var(--text3)' }

export default function CuentasCard({ cuentas, aEuros, fijosMes, fijosPendientes = null, variablesMes, pago, porCobrar, onEdit }: {
  cuentas: Cuenta[]
  aEuros: (c: Cuenta) => number
  fijosMes: number
  fijosPendientes?: number | null
  variablesMes: number
  pago: PagoImpuestos | null
  porCobrar: number
  onEdit: () => void
}) {
  const ctx: Ctx = { fijosMes, fijosPendientes, variablesMes, pago, porCobrar }
  const moneda = (c: Cuenta) => (c.moneda === 'USD' ? `$${fmt(c.saldo)}` : `€${fmt2(c.saldo)}`)
  const tiles: Tile[] = []
  const otros: Cuenta[] = []

  // Una tarjeta por bolsillo: cada apartado del BBVA va por separado, y el
  // efectivo y las cuentas sin función se agrupan en una sola.
  for (const c of cuentas.filter(c => !c.padre_id)) {
    if (c.tipo === 'cash' || c.tipo === 'otro') { otros.push(c); continue }
    const hijas = cuentas.filter(h => h.padre_id === c.id).sort((a, b) => a.orden - b.orden)
    const nombre = (x: Cuenta) => (hijas.length && x.id === c.id ? ETIQUETA[x.tipo] || 'Disponible' : x.padre_id ? x.nombre : x.tipo === 'inversion' ? 'Bote · inversión' : ETIQUETA[x.tipo] || x.nombre)
    for (const x of [c, ...hijas]) tiles.push({ key: String(x.id), grupo: c.nombre, titulo: nombre(x), color: x.color || c.color, monto: moneda(x), ...describir(x, ctx) })
  }
  if (otros.length) {
    const total = otros.reduce((s, c) => s + aEuros(c), 0)
    tiles.push({ key: 'otros', grupo: 'Efectivo', titulo: 'Efectivo y otros', color: '#94a3b8', monto: `€${fmt2(total)}`, linea: '', chip: { texto: `${otros.length} cuentas`, estado: 'neutro' }, extra: otros.map(c => ({ nombre: c.nombre.replace(/^Cash \((\w+)\)$/, (_, m) => (m === 'USD' ? 'Efectivo $' : 'Efectivo €')), monto: c.moneda === 'USD' ? `$${fmt(c.saldo)}` : `€${fmt(c.saldo)}` })) })
  }
  const total = cuentas.reduce((s, c) => s + aEuros(c), 0)

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Cuentas</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>€{fmt(total)} en total · por cobrar €{fmt(porCobrar)}</div>
        </div>
        <button className="icon-btn accent" onClick={onEdit} title="Editar saldos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></svg></button>
      </div>
      <div className="acct-grid">
        {tiles.map(t => (
          <div key={t.key} className="acct-tile" title={[t.linea, ...(t.extra || []).map(e => `${e.nombre}: ${e.monto}`)].filter(Boolean).join('\n')}>
            <div className="acct-tile-head">
              {LOGO[t.grupo.toLowerCase()]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={LOGO[t.grupo.toLowerCase()]} alt={t.grupo} className="acct-app-icon" />
                : <div className="acct-avatar" style={{ background: `${t.color}22`, color: t.color, borderColor: `${t.color}55` }}>{t.grupo.slice(0, 2).toUpperCase()}</div>}
              <div style={{ minWidth: 0 }}>
                <div className="acct-tile-grupo">{t.grupo}</div>
                <div className="acct-tile-titulo">{t.titulo}</div>
              </div>
            </div>
            <div className="acct-tile-monto">{t.monto}</div>
            <div className="acct-tile-pie">
              {t.progreso !== undefined && (
                <div className="acct-bar-track" style={{ flex: 1, marginTop: 0 }}>
                  <div className="acct-bar-fill" style={{ width: `${Math.min(100, Math.max(3, t.progreso * 100))}%`, background: t.chip ? COLOR_ESTADO[t.chip.estado] === 'var(--text3)' ? t.color : COLOR_ESTADO[t.chip.estado] : t.color }} />
                </div>
              )}
              {t.chip && <span className="acct-chip" style={{ color: COLOR_ESTADO[t.chip.estado], borderColor: COLOR_ESTADO[t.chip.estado] === 'var(--text3)' ? 'var(--border)' : `color-mix(in srgb, ${COLOR_ESTADO[t.chip.estado]} 40%, transparent)` }}>{t.chip.texto}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
