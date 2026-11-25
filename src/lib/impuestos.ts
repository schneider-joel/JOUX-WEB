// Cálculo de impuestos (modelo 130 acumulado y 303), común al navegador y
// al servidor: la pestaña Impuestos, «Qué mover» y el aviso de cobro.
import type { Compra, Factura } from './supabase'

const IVA = 0.21
const RETENCION = 0.15

// RDL 43/2026 (BOE 25-11-2026): el pago fraccionado del 130 baja del 20 % al
// 19 % desde los periodos de 2027 (cifra de negocios < 250.000 €), y los
// gastos de difícil justificación de la estimación directa simplificada
// pasan del 5 % (máx. 2.000 €) al 10 % (máx. 3.000 €) desde el ejercicio 2026.
export const tipo130 = (anio: number) => anio >= 2027 ? 0.19 : 0.20
export const dificilJustificacion = (anio: number) =>
  anio >= 2026 ? { pct: 0.10, max: 3000 } : { pct: 0.05, max: 2000 }

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export type Trimestre = {
  q: number
  ingresos: number; gastos: number; cuota: number
  rendimientoAcum: number; retencionesAcum: number; irpf: number
  ivaRep: number; ivaSop: number; iva: number
  estado: 'cerrado' | 'en curso' | 'futuro'
  declarado: boolean
}

// Importes que presentó el gestor, por trimestre ("2026-3"). Sustituyen a la
// estimación y cuentan como pagos previos en el 130 de los siguientes.
export type Reales = Record<string, { irpf?: number; iva?: number }>
export const claveReal = (anio: number, q: number) => `impuesto_real_${anio}_${q}`

// Estimación directa simplificada (Modelo 130, acumulado desde enero) y
// Modelo 303 (trimestral). Es una aproximación: no contempla amortizaciones
// ni la deducción por rendimientos bajos.
export function calcular(anio: number, facturas: Factura[], compras: Compra[], cuotaMensual: number, reales: Reales = {}): Trimestre[] {
  const hoy = new Date().toISOString().slice(0, 10)
  const out: Trimestre[] = []
  let pagosPrevios = 0
  const tipo = tipo130(anio), dj = dificilJustificacion(anio)
  for (let q = 1; q <= 4; q++) {
    const ini = `${anio}-${String(q * 3 - 2).padStart(2, '0')}-01`
    const fin = `${anio}-${String(q * 3).padStart(2, '0')}-31`
    const acum = <T extends { fecha: string }>(x: T) => x.fecha >= `${anio}-01-01` && x.fecha <= fin
    const delTrim = <T extends { fecha: string }>(x: T) => x.fecha >= ini && x.fecha <= fin
    const esUe = (f: Factura) => f.tipo_factura === 'dentro_ue'
    const ded = (c: Compra) => Number(c.base) * Number(c.deducible_pct) / 100

    const ingresosAcum = sum(facturas.filter(acum).map(f => Number(f.importe)))
    const retencionesAcum = sum(facturas.filter(acum).filter(esUe).map(f => Number(f.importe) * RETENCION))
    const gastosAcum = sum(compras.filter(acum).map(ded))
    const cuotaAcum = cuotaMensual * q * 3
    const neto = ingresosAcum - gastosAcum - cuotaAcum
    const dificil = Math.min(Math.max(0, neto) * dj.pct, dj.max)
    const rendimientoAcum = neto - dificil
    const real = reales[`${anio}-${q}`] || {}
    const irpf = real.irpf ?? Math.max(0, tipo * rendimientoAcum - retencionesAcum - pagosPrevios)
    pagosPrevios += irpf

    const ivaRep = sum(facturas.filter(delTrim).filter(esUe).map(f => Number(f.importe) * IVA))
    const ivaSop = sum(compras.filter(delTrim).map(c => ded(c) * Number(c.iva_pct) / 100))

    out.push({
      q,
      ingresos: sum(facturas.filter(delTrim).map(f => Number(f.importe))),
      gastos: sum(compras.filter(delTrim).map(ded)),
      cuota: cuotaMensual * 3,
      rendimientoAcum, retencionesAcum, irpf,
      ivaRep, ivaSop, iva: real.iva ?? ivaRep - ivaSop,
      estado: hoy > fin ? 'cerrado' : hoy >= ini ? 'en curso' : 'futuro',
      declarado: real.irpf !== undefined || real.iva !== undefined,
    })
  }
  return out
}

// Próximo pago trimestral (130 + 303): el último trimestre cerrado mientras
// su plazo siga abierto; si no, la estimación del trimestre en curso.
export function proximoPago(facturas: Factura[], compras: Compra[], cuotaMensual: number, reales: Reales = {}, hoy = new Date().toISOString().slice(0, 10)) {
  const y = Number(hoy.slice(0, 4))
  for (const [anio, q] of [[y - 1, 4], [y, 1], [y, 2], [y, 3], [y, 4]]) {
    const plazo = q === 4 ? `${anio + 1}-01-30` : `${anio}-${String(q * 3 + 1).padStart(2, '0')}-20`
    if (hoy > plazo) continue
    const t = calcular(anio, facturas, compras, cuotaMensual, reales)[q - 1]
    const iva = Math.max(0, t.iva)
    return { anio, q, plazo, cerrado: t.estado === 'cerrado', declarado: t.declarado, irpf: t.irpf, iva, total: t.irpf + iva }
  }
  return null
}
