'use client'

import type { Cuenta } from '@/lib/supabase'

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (1605 → 1.605).
const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...agrupar }).format(n)
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export type PagoImpuestos = { anio: number; q: number; plazo: string; cerrado: boolean; declarado?: boolean; total: number }

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
      const { q, plazo, cerrado, declarado, total } = ctx.pago
      const falta = total - saldo
      return {
        linea: `T${q}${declarado ? ' (gestor)' : cerrado ? '' : ' estimado'}: €${fmt2(total)} · hasta el ${fechaCorta(plazo)}`,
        chip: falta <= 0 ? { texto: declarado && falta < -1 ? `Cubierto · sobran €${fmt2(-falta)}` : 'Cubierto', estado: 'ok' } : { texto: `Faltan €${fmt2(falta)}`, estado: 'aviso' },
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

const COLOR_ESTADO: Record<Estado, string> = { ok: 'var(--green)', aviso: 'var(--amber)', neutro: 'var(--text3)' }

// Filas que no son cuentas pero van en la misma lista (crypto): ya vienen calculadas.
export type FilaExtra = { key: string; titulo: string; linea: string; monto: string }

export default function CuentasCard({ cuentas, aEuros, fijosMes, fijosPendientes = null, variablesMes, pago, porCobrar, onEdit, extra = [] }: {
  cuentas: Cuenta[]
  aEuros: (c: Cuenta) => number
  fijosMes: number
  fijosPendientes?: number | null
  variablesMes: number
  pago: PagoImpuestos | null
  porCobrar: number
  onEdit: () => void
  extra?: FilaExtra[]
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
  // Una fila por bolsillo (como la web): nombre, una línea pequeña con el banco y su estado, y el saldo.
  // Lo que cubre cada uno (la línea larga) sigue en el título, al pasar por encima.
  return (
    <section className="block" aria-label="Cuentas">
      <p className="label caps"><span>Cuentas</span><i className="rule" /><button type="button" className="label__m copy" onClick={onEdit} title="Editar saldos">Editar</button></p>
      <ul className="list focus">
        {tiles.map(t => {
          const color = t.chip ? COLOR_ESTADO[t.chip.estado] : 'var(--text3)'
          return (
            <li key={t.key} className="fila" title={[`${t.grupo} · ${t.titulo}`, t.linea, ...(t.extra || []).map(e => `${e.nombre}: ${e.monto}`)].filter(Boolean).join('\n')}>
              <div className="fila__main">
                <span className="fila__t">{t.titulo}</span>
                <span className="fila__s caps">{t.grupo}{t.chip && <> · <span style={{ color }}>{t.chip.texto}</span></>}</span>
              </div>
              {t.progreso !== undefined && (
                <span className="mini" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(3, t.progreso * 100))}%`, background: color === 'var(--text3)' ? 'var(--text)' : color }} /></span>
              )}
              <span className="num">{t.monto}</span>
            </li>
          )
        })}
        {extra.map(x => (
          <li key={x.key} className="fila">
            <div className="fila__main">
              <span className="fila__t">{x.titulo}</span>
              <span className="fila__s caps">{x.linea}</span>
            </div>
            <span className="num">{x.monto}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
