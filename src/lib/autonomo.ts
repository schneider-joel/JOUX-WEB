// Cuota de autónomo por ingresos reales (RETA, sistema de 2023): el
// rendimiento neto mensual del año decide el tramo, y el tramo, la base
// mínima. La Seguridad Social regulariza después con los datos de Hacienda,
// así que si se cotiza por debajo del tramo, la diferencia llega de golpe.
// Lo usan Finanzas › Reparto (columna Autónomo y hucha de regularización) e
// Impuestos. Sin dependencias de servidor.
import type { Compra, Factura } from './supabase'

// Bases mínimas de 2025, que siguen en 2026 (tablas publicadas por asesorías;
// comprobar en seg-social.es si cambian). Tipo conjunto 31,5 %: contingencias
// comunes 28,3 + profesionales 1,3 + cese 0,9 + formación 0,1 + MEI 0,9.
export const TIPO_RETA = 0.315
// La Seguridad Social descuenta un 7 % por gastos genéricos (3 % en societarios).
export const DEDUCCION_GENERICA = 0.07

export const TRAMOS: { hasta: number; base: number }[] = [
  { hasta: 670, base: 653.59 },
  { hasta: 900, base: 718.95 },
  { hasta: 1166.7, base: 849.67 },
  { hasta: 1300, base: 950.98 },
  { hasta: 1500, base: 960.78 },
  { hasta: 1700, base: 960.78 },
  { hasta: 1850, base: 1143.79 },
  { hasta: 2030, base: 1209.15 },
  { hasta: 2330, base: 1274.51 },
  { hasta: 2760, base: 1356.21 },
  { hasta: 3190, base: 1437.91 },
  { hasta: 3620, base: 1519.61 },
  { hasta: 4050, base: 1601.31 },
  { hasta: 6000, base: 1732.03 },
  { hasta: Infinity, base: 1928.1 },
]

export type Tramo = { n: number; desde: number; hasta: number; base: number; cuota: number }

export function tramoDe(rendimientoMensual: number): Tramo {
  const i = Math.max(0, TRAMOS.findIndex(t => rendimientoMensual <= t.hasta))
  const t = TRAMOS[i]
  return { n: i + 1, desde: i ? TRAMOS[i - 1].hasta : 0, hasta: t.hasta, base: t.base, cuota: Math.round(t.base * TIPO_RETA * 100) / 100 }
}

// Rendimiento neto mensual del año hasta hoy: base facturada (fiscal) menos
// gastos deducibles, menos el 7 %, entre los meses transcurridos (con la
// fracción del mes en curso). La propia cuota de autónomo no se resta.
export function rendimientoDelAnio(facturas: Factura[], compras: Compra[], hoy: string) {
  const anio = hoy.slice(0, 4)
  const delAnio = <T extends { fecha: string }>(x: T) => x.fecha.startsWith(anio) && x.fecha <= hoy
  const ingresos = facturas.filter(f => f.fiscal !== false && delAnio(f)).reduce((t, f) => t + Number(f.importe), 0)
  const gastos = compras.filter(delAnio).reduce((t, c) => t + Number(c.base) * Number(c.deducible_pct) / 100, 0)
  const d = new Date(hoy + 'T00:00:00')
  const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const meses = Math.max(1, d.getMonth() + d.getDate() / diasMes)
  const mensual = Math.max(0, (ingresos - gastos) * (1 - DEDUCCION_GENERICA) / meses)
  return { ingresos, gastos, meses, mensual }
}

// La cuota que corresponde frente a la que se paga, y lo que se va acumulando
// para la regularización (desde enero, con los meses transcurridos).
export function cuotaAutonomo(facturas: Factura[], compras: Compra[], cuotaReal: number, hoy: string) {
  const r = rendimientoDelAnio(facturas, compras, hoy)
  const tramo = tramoDe(r.mensual)
  const diferencia = Math.max(0, tramo.cuota - cuotaReal)
  return { ...r, tramo, cuotaReal, diferencia, regularizacionAnio: diferencia * r.meses }
}
