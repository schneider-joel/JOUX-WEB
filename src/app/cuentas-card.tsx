'use client'

import type { Cuenta } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export type PagoImpuestos = { anio: number; q: number; plazo: string; cerrado: boolean; total: number }

type Linea = { texto: string; ok?: boolean; progreso?: number }

// Cada cuenta según su función (columna tipo): qué cubre su saldo.
function lineaDe(c: Cuenta, ctx: { fijosMes: number; fijosPendientes: number | null; variablesMes: number; pago: PagoImpuestos | null; porCobrar: number }): Linea {
  const saldo = Number(c.saldo)
  switch (c.tipo) {
    case 'operativa': {
      // Con el banco conectado: lo que queda por pagar de fijos este mes.
      if (ctx.fijosPendientes !== null) {
        const falta = ctx.fijosPendientes - saldo
        return {
          texto: ctx.fijosPendientes <= 0.5 ? `Fijos del mes pagados (€${fmt(ctx.fijosMes)})`
            : falta <= 0 ? `Cubre los fijos que quedan por pagar (€${fmt(ctx.fijosPendientes)})`
            : `Faltan €${fmt2(falta)} para los fijos que quedan (€${fmt(ctx.fijosPendientes)} de €${fmt(ctx.fijosMes)})${ctx.porCobrar > 0 ? ` · por cobrar €${fmt(ctx.porCobrar)}` : ''}`,
          ok: falta <= 0,
          progreso: ctx.fijosPendientes > 0 ? saldo / ctx.fijosPendientes : 1,
        }
      }
      const falta = ctx.fijosMes - saldo
      return {
        texto: falta <= 0
          ? `Fijos del mes (€${fmt(ctx.fijosMes)}) cubiertos`
          : `Faltan €${fmt2(falta)} para los fijos (€${fmt(ctx.fijosMes)})${ctx.porCobrar > 0 ? ` · por cobrar €${fmt(ctx.porCobrar)}` : ''}`,
        ok: falta <= 0,
        progreso: ctx.fijosMes > 0 ? saldo / ctx.fijosMes : undefined,
      }
    }
    case 'irpf': {
      if (!ctx.pago) return { texto: 'Sin pago trimestral pendiente' }
      const { q, anio, plazo, cerrado, total } = ctx.pago
      const falta = total - saldo
      const periodo = `T${q}${anio !== new Date().getFullYear() ? ` ${anio}` : ''}`
      return {
        texto: `${periodo}${cerrado ? '' : ' (estimado)'}: €${fmt2(total)} hasta el ${fechaCorta(plazo)} · ${falta <= 0 ? `cubierto, sobran €${fmt2(-falta)}` : `faltan €${fmt2(falta)}`}`,
        ok: falta <= 0,
        progreso: total > 0 ? saldo / total : undefined,
      }
    }
    case 'ahorro': {
      const gastoMes = ctx.fijosMes + ctx.variablesMes
      return { texto: gastoMes > 0 ? `≈ ${(saldo / gastoMes).toFixed(1).replace('.', ',')} meses de gastos (€${fmt(gastoMes)}/mes)` : 'Ahorro' }
    }
    case 'inversion': {
      const r = Number(c.rentabilidad_anual || 0)
      return { texto: r ? `${String(r).replace('.', ',')}% anual · ≈ €${fmt2(saldo * r / 100 / 12)}/mes · €${fmt(saldo * r / 100)}/año` : 'Inversión (sin rentabilidad cargada)' }
    }
    case 'variable': {
      const hoy = new Date()
      const dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate() + 1
      return {
        texto: `de €${fmt(ctx.variablesMes)} para variables · €${fmt2(saldo / dias)}/día los ${dias} días que quedan`,
        progreso: ctx.variablesMes > 0 ? saldo / ctx.variablesMes : undefined,
      }
    }
    default:
      return { texto: c.tipo }
  }
}

const etiqueta: Record<string, string> = { operativa: 'Disponible', ahorro: 'Ahorros', irpf: 'IRPF', inversion: 'Inversión', variable: 'Variables' }

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
  const ctx = { fijosMes, fijosPendientes, variablesMes, pago, porCobrar }
  const principales = cuentas.filter(c => !c.padre_id)
  const hijas = (id: number) => cuentas.filter(c => c.padre_id === id).sort((a, b) => a.orden - b.orden)

  const fila = (c: Cuenta, nombre: string, sub = false) => {
    const l = lineaDe(c, ctx)
    const color = l.ok === undefined ? c.color : l.ok ? 'var(--green)' : 'var(--amber)'
    return (
      <div key={c.id} style={{ padding: sub ? '8px 0 8px 14px' : '10px 0', borderLeft: sub ? '1px solid var(--border)' : undefined, marginLeft: sub ? 15 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="row-title" style={sub ? { fontSize: 12.5, color: 'var(--text2)' } : undefined}>{nombre}</span>
          <span className="row-amount" style={sub ? { fontSize: 12.5 } : undefined}>{c.moneda === 'USD' ? `$${fmt(c.saldo)}` : `€${fmt2(c.saldo)}`}</span>
        </div>
        <div style={{ fontSize: 10.5, color: l.ok === false ? 'var(--amber)' : 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>
          {c.moneda === 'USD' ? `≈ €${fmt(aEuros(c))} · ${l.texto}` : l.texto}
        </div>
        {l.progreso !== undefined && (
          <div className="acct-bar-track"><div className="acct-bar-fill" style={{ width: `${Math.min(100, Math.max(2, l.progreso * 100))}%`, background: color }} /></div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Cuentas</div>
        <button className="icon-btn accent" onClick={onEdit} title="Editar saldos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></svg></button>
      </div>
      {principales.map(c => {
        const subs = hijas(c.id)
        if (!subs.length) return <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>{fila(c, c.nombre)}</div>
        const total = Number(c.saldo) + subs.reduce((s, h) => s + Number(h.saldo), 0)
        return (
          <div key={c.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span className="row-title" style={{ fontWeight: 500 }}>{c.nombre}</span>
              <span className="row-amount">€{fmt2(total)}</span>
            </div>
            {fila(c, etiqueta[c.tipo] || 'Disponible', true)}
            {subs.map(h => fila(h, h.nombre, true))}
          </div>
        )
      })}
    </div>
  )
}
