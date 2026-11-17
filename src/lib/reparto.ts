// Reparto de cada cobro (Finanzas › Reparto). Regla de Joel (2026-11-17), en
// cascada: 1) impuestos de sus facturas (IVA + IRPF) a la hucha de impuestos;
// 2) la diferencia entre la cuota del tramo real y la que se paga, a la hucha
// «Regularización autónomo» (se acumula por mes trabajado); 3) la reserva del
// MES SIGUIENTE: cuota de autónomo, fijos y variables, que se quedan en la
// operativa (Joel carga BBVA y Revolut el día 1, así que lo que cobra durante
// el mes paga el mes que viene; el día 1 los variables pasan a Revolut);
// 4) el resto en % (`configuracion.reparto_resto`). Cada objetivo cuenta lo
// que ya cubrieron los cobros anteriores. Sin dependencias de servidor.
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

// Mes siguiente a una fecha (AAAA-MM).
export const mesSiguiente = (fecha: string) => {
  const [a, m] = fecha.slice(0, 7).split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1]

// A qué mes cuenta cada destino: la regularización, al mes del cobro; la
// reserva (autónomo, fijos, variables), al mes siguiente.
const claveDe = (destino: Destino, fecha: string) =>
  destino === 'regularizacion' ? `${destino}:${fecha.slice(0, 7)}` : `${destino}:${mesSiguiente(fecha)}`

// Propuesta de cada cobro, en orden de fecha. Los congelados se respetan tal
// cual y cuentan primero para lo ya cubierto.
export function repartir(cobros: Cobro[], ctx: Contexto): Map<Cobro, Linea[]> {
  const { op, hucha, variables } = cuentasDelReparto(ctx.cuentas)
  const regDif = Math.max(0, ctx.cuotaTramo - ctx.cuotaReal)
  const cubierto: Record<string, number> = {}
  const sumar = (destino: Destino, fecha: string, n: number) => { const k = claveDe(destino, fecha); cubierto[k] = (cubierto[k] || 0) + n; return n }
  const ya = (destino: Destino, fecha: string) => cubierto[claveDe(destino, fecha)] || 0
  const out = new Map<Cobro, Linea[]>()
  const orden = [...cobros].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.movimiento_id || '').localeCompare(b.movimiento_id || ''))

  // Lo guardado cuenta primero, sea de la fecha que sea: si no, un cobro
  // anterior sin guardar volvería a pedir lo que ya cubrió uno guardado.
  for (const c of orden) {
    if (!c.lineas) continue
    for (const l of c.lineas) if (l.destino !== 'impuestos' && l.destino !== 'resto') sumar(l.destino, c.fecha, Number(l.importe))
    out.set(c, c.lineas)
  }

  for (const c of orden) {
    if (c.lineas) continue
    const sig = nombreMes(mesSiguiente(c.fecha))
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
    if (ctx.huchaRegularizacion && regDif > 0)
      sumar('regularizacion', c.fecha, poner({ destino: 'regularizacion', etiqueta: 'Regularización', cuenta_id: ctx.huchaRegularizacion.cuenta_id, hucha_id: ctx.huchaRegularizacion.id, detalle: `tramo ${eur(ctx.cuotaTramo)} − pagas ${eur(ctx.cuotaReal)}` }, regDif - ya('regularizacion', c.fecha)))
    sumar('autonomo', c.fecha, poner({ destino: 'autonomo', etiqueta: 'Autónomo', cuenta_id: op?.id ?? null, hucha_id: null, detalle: `cuota de ${sig} ${eur(ctx.cuotaReal)}, se queda en ${op?.nombre || 'la operativa'}` }, ctx.cuotaReal - ya('autonomo', c.fecha)))
    sumar('fijos', c.fecha, poner({ destino: 'fijos', etiqueta: 'Fijos', cuenta_id: op?.id ?? null, hucha_id: null, detalle: `fijos de ${sig} ${eur(ctx.fijosMes)}, se quedan en ${op?.nombre || 'la operativa'}` }, ctx.fijosMes - ya('fijos', c.fecha)))
    sumar('variables', c.fecha, poner({ destino: 'variables', etiqueta: 'Variables', cuenta_id: op?.id ?? null, hucha_id: null, detalle: `variables de ${sig} ${eur(ctx.variablesMes)}: déjalos en ${op?.nombre || 'la operativa'} y pásalos a ${variables?.nombre || 'variables'} el día 1` }, ctx.variablesMes - ya('variables', c.fecha)))

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
