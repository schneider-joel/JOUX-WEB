// Gasto del mes por partida del presupuesto, común al navegador y al servidor
// (la tarjeta Presupuesto, «Qué mover» y el aviso de cobro).
import { deudaDe, type GastoCompartido } from './compartidos'

export type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }

// Parte del alquiler que paga la pareja (el alquiler sale entero de tu cuenta
// y ella te devuelve su mitad junto con otros gastos compartidos).
export const PARTE_PAREJA_ALQUILER = 0.5

// Categorías de la cuenta compartida que no se llaman igual que una partida.
const PARTIDA_DE: Record<string, string> = { Salidas: 'Ocio / Bares / Salidas', Casa: 'Imprevistos / Amazon' }

// Gastado este mes en cada partida, a partir de los movimientos del banco
// (las devoluciones restan). Solo cuenta lo clasificado como gasto; las
// compras de trabajo no gastan de las partidas indicadas (las variables).
//
// Con la cuenta compartida (compartidos), cada partida cuenta solo tu parte:
// a lo que pagaste se le resta la parte de Sofía, y lo que pagó ella por ti
// se suma. Sus transferencias solo saldan la deuda y no cambian el gasto.
// Sin ella (meses anteriores), sus reembolsos descuentan su mitad del alquiler.
export function gastadoPorPartida(movs: Mov[], sinTrabajo: Set<string> = new Set(), mes = new Date().toISOString().slice(0, 7), compartidos: GastoCompartido[] | null = null) {
  const out: Record<string, number> = {}
  let reembolsos = 0
  for (const m of movs) {
    if (!m.fecha.startsWith(mes)) continue
    if (m.clase === 'reembolso') { reembolsos += Number(m.importe); continue }
    if (m.clase !== 'gasto' || !m.categoria) continue
    if (m.trabajo && sinTrabajo.has(m.categoria)) continue
    out[m.categoria] = (out[m.categoria] || 0) - Number(m.importe)
  }
  if (compartidos) {
    let parteSuya = 0, parteTuya = 0
    for (const g of compartidos) {
      if (g.tipo !== 'gasto' || !g.fecha.startsWith(mes) || !g.categoria) continue
      const partida = PARTIDA_DE[g.categoria] || g.categoria
      const parte = deudaDe(g)
      if (g.pagador === 'joel') { out[partida] = (out[partida] || 0) - parte; parteSuya += parte }
      else { out[partida] = (out[partida] || 0) + parte; parteTuya += parte }
    }
    return Object.assign(out, { __parteSuya: parteSuya, __parteTuya: parteTuya })
  }
  const alquiler = Math.min(reembolsos, Math.max(0, (out['Alquiler'] || 0) * PARTE_PAREJA_ALQUILER))
  if (alquiler) out['Alquiler'] -= alquiler
  return Object.assign(out, { __reembolsoAlquiler: alquiler, __compartidos: reembolsos - alquiler })
}
