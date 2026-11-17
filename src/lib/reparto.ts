// Reparto de cada cobro (Finanzas › Reparto). Regla de Joel (2026-11-17), en
// cascada: 1) impuestos de sus facturas (IVA + IRPF) a la hucha de impuestos;
// 2) la cuota de autónomo del mes (la que se paga, en la operativa) y la
// diferencia con la del tramo real a la hucha «Regularización autónomo»;
// 3) lo que falte para los fijos del mes; 4) lo que falte para los variables
// (Revolut); 5) el resto en % (`configuracion.reparto_resto`).
// Los pasos 2–4 son del mes: lo que ya cubrió un cobro anterior del mismo
// mes no se vuelve a pedir. Sin dependencias de servidor.
import type { Cuenta, Factura } from './supabase'

export const IVA = 0.21
export const RETENCION = 0.15
export const IRPF_130 = 0.20

export type Destino = 'impuestos' | 'autonomo' | 'regularizacion' | 'fijos' | 'variables' | 'resto'
export type Linea = {
  id?: number
  destino: Destino
  etiqueta: string
  cuenta_id: number | null
  hucha_id: number | null
  importe: number
  orden: number
  hecho?: boolean
  detalle?: string
}
export type ParteResto = { cuenta_id?: number | null; destino?: 'crypto'; pct: number }
export type Hucha = {
  id: number; cuenta_id: number; nombre: string; clave: string | null
  meta: number | null; fecha_meta: string | null; pct_auto: number
  color: string | null; orden: number; archivada: boolean
}
export type HuchaMov = { id: number; hucha_id: number; fecha: string; importe: number; motivo: string | null; reparto_linea_id: number | null }

export type Cobro = {
  movimiento_id: string | null
  fecha: string
  importe: number
  concepto: string
  facturas: Pick<Factura, 'importe' | 'tipo_factura' | 'numero'>[]
  reparto_id?: number          // congelado (tiene filas en `repartos`)
  lineas?: Linea[]             // las guardadas si está congelado
}

export type Contexto = {
  cuentas: Cuenta[]
  fijosMes: number             // fijos del presupuesto sin la cuota de autónomo
  variablesMes: number
  cuotaReal: number            // la que se paga (`cuota_autonomo_mensual`)
  cuotaTramo: number           // la del tramo real (src/lib/autonomo.ts)
  factorIrpf: number           // rendimiento / ingresos del año: el 130 va sobre el neto
  resto: ParteResto[]
  huchaRegularizacion: Hucha | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Math.round(n))

export const esCuotaAutonomo = (nombre: string) => /aut[oó]nomo/i.test(nombre)

export const cuentasDelReparto = (cuentas: Cuenta[]) => ({
  op: cuentas.find(c => c.tipo === 'operativa' && !c.padre_id) || null,
  hucha: cuentas.find(c => c.tipo === 'irpf') || null,
  variables: cuentas.find(c => c.tipo === 'variable') || null,
})

// Impuestos de un cobro: IVA de las facturas de España y el IRPF del 130 sobre
// el neto, menos la retención que ya hizo el cliente. Sin factura enlazada se
// trata como un cobro de fuera de España (sin IVA ni retención).
export function impuestosDe(c: Pick<Cobro, 'importe' | 'facturas'>, factorIrpf: number) {
  const fs = c.facturas.length ? c.facturas : [{ importe: c.importe, tipo_factura: 'fuera_ue' as const }]
  let iva = 0, irpf = 0
  for (const f of fs) {
    const base = Number(f.importe), es = f.tipo_factura === 'dentro_ue'
    if (es) iva += base * IVA
    irpf += Math.max(0, base * IRPF_130 * factorIrpf - (es ? base * RETENCION : 0))
  }
  return { iva: r2(iva), irpf: r2(irpf) }
}

// Propuesta de cada cobro, en orden de fecha. Los congelados se respetan tal
// cual y cuentan para lo ya cubierto en su mes.
export function repartir(cobros: Cobro[], ctx: Contexto): Map<Cobro, Linea[]> {
  const { op, hucha, variables } = cuentasDelReparto(ctx.cuentas)
  const regDif = Math.max(0, ctx.cuotaTramo - ctx.cuotaReal)
  const cubierto: Record<string, Record<'autonomo' | 'regularizacion' | 'fijos' | 'variables', number>> = {}
  const out = new Map<Cobro, Linea[]>()
  const orden = [...cobros].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.movimiento_id || '').localeCompare(b.movimiento_id || ''))

  // Lo guardado cuenta primero, sea de la fecha que sea: si no, un cobro
  // anterior sin guardar volvería a pedir lo que ya cubrió uno guardado.
  for (const c of orden) {
    if (!c.lineas) continue
    const acc = (cubierto[c.fecha.slice(0, 7)] ||= { autonomo: 0, regularizacion: 0, fijos: 0, variables: 0 })
    for (const l of c.lineas) if (l.destino in acc) acc[l.destino as keyof typeof acc] += Number(l.importe)
    out.set(c, c.lineas)
  }

  for (const c of orden) {
    if (c.lineas) continue
    const mes = c.fecha.slice(0, 7)
    const acc = (cubierto[mes] ||= { autonomo: 0, regularizacion: 0, fijos: 0, variables: 0 })
    let queda = r2(Number(c.importe))
    const lineas: Linea[] = []
    const poner = (l: Omit<Linea, 'orden' | 'importe'>, quiere: number) => {
      const imp = r2(Math.min(queda, Math.max(0, quiere)))
      if (imp <= 0) return 0
      lineas.push({ ...l, importe: imp, orden: lineas.length })
      queda = r2(queda - imp)
      return imp
    }

    const imp = impuestosDe(c, ctx.factorIrpf)
    poner({ destino: 'impuestos', etiqueta: 'Impuestos', cuenta_id: hucha?.id ?? null, hucha_id: null,
      detalle: [imp.iva ? `IVA ${eur(imp.iva)}` : '', `IRPF ${eur(imp.irpf)}`, c.facturas.length ? '' : 'sin factura'].filter(Boolean).join(' · ') }, imp.iva + imp.irpf)
    acc.autonomo += poner({ destino: 'autonomo', etiqueta: 'Autónomo', cuenta_id: op?.id ?? null, hucha_id: null, detalle: `cuota del mes ${eur(ctx.cuotaReal)}` }, ctx.cuotaReal - acc.autonomo)
    if (ctx.huchaRegularizacion && regDif > 0)
      acc.regularizacion += poner({ destino: 'regularizacion', etiqueta: 'Regularización', cuenta_id: ctx.huchaRegularizacion.cuenta_id, hucha_id: ctx.huchaRegularizacion.id, detalle: `tramo ${eur(ctx.cuotaTramo)} − pagas ${eur(ctx.cuotaReal)}` }, regDif - acc.regularizacion)
    acc.fijos += poner({ destino: 'fijos', etiqueta: 'Fijos', cuenta_id: op?.id ?? null, hucha_id: null, detalle: `fijos del mes ${eur(ctx.fijosMes)}` }, ctx.fijosMes - acc.fijos)
    acc.variables += poner({ destino: 'variables', etiqueta: 'Variables', cuenta_id: variables?.id ?? null, hucha_id: null, detalle: `variables del mes ${eur(ctx.variablesMes)}` }, ctx.variablesMes - acc.variables)

    // El resto, en %: si no suman 100 se reparte en proporción; el último se lleva el redondeo.
    const partes = ctx.resto.filter(p => p.pct > 0)
    const suma = partes.reduce((t, p) => t + p.pct, 0)
    if (queda > 0 && suma > 0) {
      const total = queda
      partes.forEach((p, i) => {
        const imp = i === partes.length - 1 ? queda : r2(total * p.pct / suma)
        const cuenta = p.cuenta_id ? ctx.cuentas.find(x => x.id === p.cuenta_id) : null
        poner({ destino: 'resto', etiqueta: cuenta?.nombre || (p.destino === 'crypto' ? 'Crypto' : 'Otro'), cuenta_id: cuenta?.id ?? null, hucha_id: null, detalle: `${Math.round(p.pct / suma * 100)} % del resto` }, imp)
      })
    }
    out.set(c, lineas)
  }
  return out
}

// Lo asignado a cada hucha (suma de sus movimientos) y lo que queda sin
// asignar en cada cuenta.
export function asignadoPorHucha(movs: HuchaMov[]) {
  const out: Record<number, number> = {}
  for (const m of movs) out[m.hucha_id] = r2((out[m.hucha_id] || 0) + Number(m.importe))
  return out
}

// Lo que se lleva cada hucha de un ✓ que entra en su cuenta (su % automático).
export function aportesAuto(l: Pick<Linea, 'cuenta_id' | 'hucha_id' | 'importe'>, huchas: Hucha[]) {
  if (l.hucha_id) return [{ hucha_id: l.hucha_id, importe: r2(Number(l.importe)) }]
  if (!l.cuenta_id) return []
  return huchas.filter(h => h.cuenta_id === l.cuenta_id && !h.archivada && Number(h.pct_auto) > 0)
    .map(h => ({ hucha_id: h.id, importe: r2(Number(l.importe) * Number(h.pct_auto) / 100) }))
    .filter(x => x.importe > 0)
}

export function parseResto(valor: string | null | undefined): ParteResto[] {
  try { const v = JSON.parse(valor || '[]'); return Array.isArray(v) ? v.filter(p => typeof p?.pct === 'number') : [] } catch { return [] }
}
