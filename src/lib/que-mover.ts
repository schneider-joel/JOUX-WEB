// «Qué mover»: los traspasos que tocan hoy entre las cuentas, según la
// regla de Joel (2026-10-22). Al empezar el mes, la cuenta operativa (BBVA
// …4921) cubre los gastos fijos y Revolut los variables; de cada cobro, lo
// que toca de impuestos va a la hucha (apartado de BBVA) y el resto a la
// cuenta de ahorro. Se calcula sobre saldos y no cobro a cobro: así una
// factura de un trimestre ya pagado no aparta impuestos dos veces.
import type { Compra, Cuenta, Factura } from './supabase'
import { calcular, type Reales } from './impuestos'
import { CATEGORIA_IMPUESTOS } from './movimientos'

export type Traspaso = { clave: string; texto: string; sub: string; importe: number; aviso?: boolean }

type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null }

const plazoDe = (anio: number, q: number) => (q === 4 ? `${anio + 1}-01-30` : `${anio}-${String(q * 3 + 1).padStart(2, '0')}-20`)
const finDe = (anio: number, q: number) => `${anio}-${String(q * 3).padStart(2, '0')}-${q === 1 || q === 4 ? 31 : 30}`

// Lo que debería haber en la hucha: el IRPF (130) y el IVA (303) del
// trimestre en curso y, mientras su plazo siga abierto, los del anterior si
// aún no hay un cargo de Hacienda después de cerrarlo.
export function impuestosPorApartar(facturas: Factura[], compras: Compra[], cuotaMensual: number, reales: Reales, movs: Mov[], hoy: string) {
  const anio = Number(hoy.slice(0, 4)), q = Math.ceil(Number(hoy.slice(5, 7)) / 3)
  const total = (a: number, t: number) => { const x = calcular(a, facturas, compras, cuotaMensual, reales)[t - 1]; return x.irpf + Math.max(0, x.iva) }
  const enCurso = total(anio, q)
  const [pa, pq] = q === 1 ? [anio - 1, 4] : [anio, q - 1]
  const pagado = movs.some(m => m.categoria === CATEGORIA_IMPUESTOS && Number(m.importe) < 0 && m.fecha > finDe(pa, pq))
  const anterior = hoy <= plazoDe(pa, pq) && !pagado ? total(pa, pq) : 0
  return { objetivo: enCurso + anterior, q, anterior: anterior ? pq : null }
}

const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.round(n))

export function queMover({ cuentas, fijosPendientes, variablesPendientes, impuestos }: {
  cuentas: Cuenta[]
  fijosPendientes: number
  variablesPendientes: number
  impuestos: { objetivo: number; q: number; anterior: number | null }
}): Traspaso[] {
  const op = cuentas.find(c => c.tipo === 'operativa' && !c.padre_id)
  if (!op) return []
  const hucha = cuentas.find(c => c.tipo === 'irpf' && c.padre_id === op.id)
  const variables = cuentas.find(c => c.tipo === 'variable')
  const ahorro = cuentas.find(c => c.tipo === 'ahorro' && !c.padre_id)
  const banco = op.nombre
  const out: Traspaso[] = []

  // Hucha de impuestos: lo que falta sale de la operativa; lo que sobra va a ahorro.
  const trimestre = impuestos.anterior ? `T${impuestos.anterior} y T${impuestos.q}` : `T${impuestos.q}`
  const faltaImp = hucha ? impuestos.objetivo - Number(hucha.saldo) : 0
  if (hucha && faltaImp >= 1) out.push({ clave: 'imp', texto: `Pasa ${eur(Math.ceil(faltaImp))} a la hucha de impuestos`, sub: `${banco} → ${hucha.nombre} · IRPF e IVA del ${trimestre}: ${eur(impuestos.objetivo)}`, importe: Math.ceil(faltaImp) })
  if (hucha && ahorro && faltaImp <= -1) out.push({ clave: 'imp', texto: `Pasa ${eur(Math.floor(-faltaImp))} de la hucha a ahorros`, sub: `${hucha.nombre} → ${ahorro.nombre} · sobra: el ${trimestre} pide ${eur(impuestos.objetivo)}`, importe: Math.floor(-faltaImp) })

  // Variables: Revolut tiene que cubrir lo que queda del presupuesto variable del mes.
  const recarga = variables ? variablesPendientes - Number(variables.saldo) : 0
  if (variables && recarga >= 1) out.push({ clave: 'var', texto: `Recarga ${eur(Math.ceil(recarga))} en ${variables.nombre}`, sub: `${banco} → ${variables.nombre} · variables que quedan este mes: ${eur(variablesPendientes)}`, importe: Math.ceil(recarga) })

  // Lo que queda en la operativa por encima de los fijos por pagar (y de lo
  // que acaba de salir hacia la hucha y Revolut) es ahorro.
  const libre = Number(op.saldo) - fijosPendientes - Math.max(0, faltaImp) - Math.max(0, recarga)
  if (ahorro && libre >= 1) out.push({ clave: 'aho', texto: `Pasa ${eur(Math.floor(libre))} a ahorros`, sub: `${banco} → ${ahorro.nombre} · quedan ${eur(fijosPendientes)} para los fijos del mes`, importe: Math.floor(libre) })
  if (libre <= -1) out.push({ clave: 'aho', texto: `Faltan ${eur(Math.ceil(-libre))} en ${banco}`, sub: `Fijos por pagar este mes: ${eur(fijosPendientes)}${ahorro ? ` · tráelos de ${ahorro.nombre}` : ''}`, importe: Math.ceil(-libre), aviso: true })
  return out
}
