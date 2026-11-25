// Reparto de cada cobro (Finanzas › Reparto). Regla de Joel (2026-11-17), en
// cascada (cada destino va a su hucha de BBVA si existe, ver CLAVE_DESTINO):
// 1) impuestos de sus facturas (IVA + IRPF) a la hucha de impuestos;
// 2) la diferencia entre la cuota del tramo real y la que se paga, a la hucha
// «Regularización autónomo» (se acumula por mes trabajado); 3) la reserva del
// MES SIGUIENTE: cuota de autónomo, fijos y variables, que se quedan en la
// operativa (Joel carga BBVA y Revolut el día 1, así que lo que cobra durante
// el mes paga el mes que viene; el día 1 los variables pasan a Revolut);
// 4) el resto en % (`configuracion.reparto_resto`). Cada objetivo cuenta lo
// que ya cubrieron los cobros anteriores. La reserva del mes en curso se mide
// con el saldo real de las huchas de fijos y variables (2026-11-19): lo ya
// traspasado está dentro, y lo que se apartó antes de que existieran (y se
// gastó) no cuenta. Sin dependencias de servidor.
import type { Cuenta, Factura } from './supabase'
import { tipo130 } from './impuestos'

export const IVA = 0.21
export const RETENCION = 0.15

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
  facturas: (Pick<Factura, 'importe' | 'tipo_factura' | 'numero'> & { fecha?: string })[]
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
  huchas: Hucha[]              // las activas: cada destino busca la suya por clave
  mesActual?: string           // AAAA-MM: su reserva se mide con el saldo de las huchas
  saldoHuchas?: Record<number, number>  // asignado a cada hucha (asignadoPorHucha)
}

// Las huchas de BBVA (dentro del apartado, la subcuenta tipo irpf) que recibe
// cada destino. La cuota de autónomo va con los fijos: se paga con ellos.
export const CLAVE_DESTINO: Partial<Record<Destino, string>> = {
  impuestos: 'irpf', regularizacion: 'regularizacion_autonomo',
  autonomo: 'fijos_mes', fijos: 'fijos_mes', variables: 'variables_mes',
}
export const huchaDeDestino = (destino: Destino, huchas: Hucha[]) => {
  const k = CLAVE_DESTINO[destino]
  return (k && huchas.find(h => h.clave === k && !h.archivada)) || null
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
// trata como un cobro de fuera de España (sin IVA ni retención). El tipo del
// 130 es el del año de emisión de la factura (sin factura, el del cobro).
export function impuestosDe(c: Pick<Cobro, 'importe' | 'facturas' | 'fecha'>, factorIrpf: number) {
  const fs = c.facturas.length ? c.facturas : [{ importe: c.importe, tipo_factura: 'fuera_ue' as const, fecha: c.fecha }]
  let iva = 0, irpf = 0
  for (const f of fs) {
    const base = Number(f.importe), es = f.tipo_factura === 'dentro_ue'
    const tipo = tipo130(Number((f.fecha || c.fecha).slice(0, 4)))
    if (es) iva += base * IVA
    irpf += Math.max(0, base * tipo * factorIrpf - (es ? base * RETENCION : 0))
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

// La cuota de autónomo es un fijo más (2026-11-19): va en la línea de fijos.
// Las líneas «autonomo» guardadas antes cuentan como fijos.
const deReserva = (destino: Destino): Destino => destino === 'autonomo' ? 'fijos' : destino

// A qué mes cuenta cada destino: la regularización, al mes del cobro; la
// reserva (fijos con la cuota, variables), al mes siguiente.
const claveDe = (destino: Destino, fecha: string) =>
  destino === 'regularizacion' ? `${destino}:${fecha.slice(0, 7)}` : `${deReserva(destino)}:${mesSiguiente(fecha)}`

const RESERVA: Destino[] = ['fijos', 'variables']

// Lo que ya hay para la reserva del mes siguiente al actual, según el saldo de
// sus huchas (la de fijos incluye la cuota). null si no se mide así (sin mes
// actual o sin huchas).
export function reservaEnHuchas(ctx: Contexto) {
  if (!ctx.mesActual || !ctx.saldoHuchas) return null
  const hf = huchaDeDestino('fijos', ctx.huchas), hv = huchaDeDestino('variables', ctx.huchas)
  if (!hf && !hv) return null
  const saldo = (h: Hucha | null) => h ? r2(Math.max(0, ctx.saldoHuchas![h.id] || 0)) : null
  return { fijos: saldo(hf), variables: saldo(hv) } as Partial<Record<Destino, number | null>>
}

// Propuesta de cada cobro, en orden de fecha. Los congelados se respetan tal
// cual y cuentan primero para lo ya cubierto.
export function repartir(cobros: Cobro[], ctx: Contexto): Map<Cobro, Linea[]> {
  const { op, hucha, variables } = cuentasDelReparto(ctx.cuentas)
  // Adónde va cada destino: su hucha si existe; si no, la cuenta de siempre.
  const a = (d: Destino, cuenta: Cuenta | null) => {
    const h = huchaDeDestino(d, ctx.huchas)
    return { cuenta_id: h?.cuenta_id ?? cuenta?.id ?? null, hucha_id: h?.id ?? null, donde: h ? `hucha ${h.nombre}` : cuenta?.nombre || 'la operativa', h }
  }
  const dImp = a('impuestos', hucha), dReg = a('regularizacion', null), dFij = a('fijos', op), dVar = a('variables', op)
  const regDif = Math.max(0, ctx.cuotaTramo - ctx.cuotaReal)
  const cubierto: Record<string, number> = {}
  const sumar = (destino: Destino, fecha: string, n: number) => { const k = claveDe(destino, fecha); cubierto[k] = (cubierto[k] || 0) + n; return n }
  const ya = (destino: Destino, fecha: string) => cubierto[claveDe(destino, fecha)] || 0
  // Reserva del mes en curso: parte del saldo real de su hucha; de lo guardado
  // solo suma lo que falta por traspasar (lo hecho ya está en el saldo).
  const real = reservaEnHuchas(ctx)
  const medidoEnHucha = (destino: Destino, fecha: string) =>
    !!real && fecha.slice(0, 7) === ctx.mesActual && RESERVA.includes(deReserva(destino)) && real[deReserva(destino)] != null
  if (real && ctx.mesActual) {
    const sig = mesSiguiente(ctx.mesActual)
    for (const d of RESERVA) if (real[d] != null) cubierto[`${d}:${sig}`] = real[d]!
  }
  const out = new Map<Cobro, Linea[]>()
  const orden = [...cobros].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.movimiento_id || '').localeCompare(b.movimiento_id || ''))

  // Lo guardado cuenta primero, sea de la fecha que sea: si no, un cobro
  // anterior sin guardar volvería a pedir lo que ya cubrió uno guardado.
  for (const c of orden) {
    if (!c.lineas) continue
    for (const l of c.lineas) {
      if (l.destino === 'impuestos' || l.destino === 'resto') continue
      if (l.hecho && medidoEnHucha(l.destino, c.fecha)) continue
      sumar(l.destino, c.fecha, Number(l.importe))
    }
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
    poner({ destino: 'impuestos', etiqueta: 'Impuestos', cuenta_id: dImp.cuenta_id, hucha_id: dImp.hucha_id,
      detalle: [imp.iva ? `IVA ${eur(imp.iva)}` : '', `IRPF ${eur(imp.irpf)}`, c.facturas.length ? '' : 'sin factura'].filter(Boolean).join(' · ') }, imp.iva + imp.irpf)
    if (dReg.h && regDif > 0)
      sumar('regularizacion', c.fecha, poner({ destino: 'regularizacion', etiqueta: 'Regularización', cuenta_id: dReg.cuenta_id, hucha_id: dReg.hucha_id, detalle: `tramo ${eur(ctx.cuotaTramo)} − pagas ${eur(ctx.cuotaReal)}, a la ${dReg.donde}` }, regDif - ya('regularizacion', c.fecha)))
    const fijosConCuota = ctx.cuotaReal + ctx.fijosMes
    sumar('fijos', c.fecha, poner({ destino: 'fijos', etiqueta: 'Fijos', cuenta_id: dFij.cuenta_id, hucha_id: dFij.hucha_id, detalle: `fijos de ${sig} ${eur(fijosConCuota)} (cuota de autónomo ${eur(ctx.cuotaReal)} incluida), a la ${dFij.h ? dFij.donde : `cuenta ${dFij.donde}`}` }, fijosConCuota - ya('fijos', c.fecha)))
    sumar('variables', c.fecha, poner({ destino: 'variables', etiqueta: 'Variables', cuenta_id: dVar.cuenta_id, hucha_id: dVar.hucha_id, detalle: `variables de ${sig} ${eur(ctx.variablesMes)}, a la ${dVar.h ? dVar.donde : `cuenta ${dVar.donde}`}; el día 1 pásalos a ${variables?.nombre || 'variables'}` }, ctx.variablesMes - ya('variables', c.fecha)))

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
// Las líneas guardadas antes de que existiera la hucha de su destino van a
// ella igualmente.
export function aportesAuto(l: Pick<Linea, 'cuenta_id' | 'hucha_id' | 'importe'> & { destino?: Destino }, huchas: Hucha[]) {
  const hid = l.hucha_id || (l.destino && huchaDeDestino(l.destino, huchas)?.id)
  if (hid) return [{ hucha_id: hid, importe: r2(Number(l.importe)) }]
  if (!l.cuenta_id) return []
  return huchas.filter(h => h.cuenta_id === l.cuenta_id && !h.archivada && Number(h.pct_auto) > 0)
    .map(h => ({ hucha_id: h.id, importe: r2(Number(l.importe) * Number(h.pct_auto) / 100) }))
    .filter(x => x.importe > 0)
}

export function parseResto(valor: string | null | undefined): ParteResto[] {
  try { const v = JSON.parse(valor || '[]'); return Array.isArray(v) ? v.filter(p => typeof p?.pct === 'number') : [] } catch { return [] }
}
