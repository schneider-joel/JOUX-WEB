'use client'

import type { PresupuestoItem } from '@/lib/supabase'
import { deudaDe, type GastoCompartido } from '@/lib/compartidos'

type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (2005 → 2.005).
const eur = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.round(n))

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

// Barra fina con marcador opcional del ritmo del mes.
function Barra({ pct, color, ritmo, alto = 4 }: { pct: number; color: string; ritmo?: number; alto?: number }) {
  return (
    <div className="presu-barra" style={{ height: alto }}>
      <div style={{ width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct * 100))}%`, background: color }} />
      {ritmo !== undefined && <span style={{ left: `${ritmo * 100}%`, top: -3, height: alto + 6 }} title="Ritmo del mes" />}
    </div>
  )
}

export default function PresupuestoCard({ fijos, variables, movimientos, compartidos = null }: { fijos: PresupuestoItem[]; variables: PresupuestoItem[]; movimientos: Mov[]; compartidos?: GastoCompartido[] | null }) {
  if (!movimientos.length) return null
  const gastado = gastadoPorPartida(movimientos, new Set(variables.map(v => v.nombre)), undefined, compartidos)
  const parteSuya = gastado.__parteSuya || 0
  const hoy = new Date()
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const avanceMes = hoy.getDate() / diasMes
  const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long' })

  const suma = (items: PresupuestoItem[]) => ({
    total: items.reduce((s, i) => s + Number(i.limite), 0),
    usado: items.reduce((s, i) => s + Math.max(0, gastado[i.nombre] || 0), 0),
  })
  const f = suma(fijos), v = suma(variables)
  const pctV = v.total > 0 ? v.usado / v.total : 0
  const vaAlto = pctV > avanceMes + 0.1

  return (
    <div className="card card-fill">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">Presupuesto de {nombreMes}</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>Día {hoy.getDate()} de {diasMes}</div>
        </div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>
          €{eur(f.usado + v.usado)} <span style={{ color: 'var(--text3)' }}>/ €{eur(f.total + v.total)}</span>
        </div>
      </div>

      <div className="presu-grid">
        {/* Fijos: pagado o no, como una lista de comprobación. */}
        <section>
          <div className="presu-resumen">
            <span className="card-kicker">Fijos</span>
            <span className="mono presu-cifra">€{eur(f.usado)} <span>/ €{eur(f.total)}</span></span>
          </div>
          <Barra pct={f.total ? f.usado / f.total : 0} color={f.usado >= f.total - 0.5 ? 'var(--green)' : 'var(--text2)'} />
          <div className="presu-estado" style={{ color: f.usado >= f.total - 0.5 ? 'var(--green)' : 'var(--text3)' }}>
            {f.usado >= f.total - 0.5 ? 'Todo pagado' : `Quedan €${eur(f.total - f.usado)} por pagar`}
          </div>
          <ul className="presu-lista">
            {fijos.map(i => {
              const g = Math.max(0, gastado[i.nombre] || 0), lim = Number(i.limite)
              const pagado = g >= lim * 0.95, parcial = !pagado && g > 0
              return (
                <li key={i.id} className={pagado ? 'pagado' : ''}>
                  <span className={`presu-check${pagado ? ' ok' : parcial ? ' medio' : ''}`} aria-hidden="true">
                    {pagado && <svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                  </span>
                  <span className="presu-nombre">{i.nombre}</span>
                  <span className="mono presu-monto">{parcial ? <>€{eur(g)} <span>/ {eur(lim)}</span></> : `€${eur(pagado ? g : lim)}`}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Variables: cuánto llevas frente al ritmo del mes. */}
        <section>
          <div className="presu-resumen">
            <span className="card-kicker">Variables</span>
            <span className="mono presu-cifra">€{eur(v.usado)} <span>/ €{eur(v.total)}</span></span>
          </div>
          <Barra pct={pctV} color={pctV > 1 ? 'var(--red)' : vaAlto ? 'var(--amber)' : 'var(--accent)'} ritmo={avanceMes} />
          <div className="presu-estado" style={{ color: pctV > 1 ? 'var(--red)' : vaAlto ? 'var(--amber)' : 'var(--text3)' }}>
            {pctV > 1 ? `Te has pasado €${eur(v.usado - v.total)}` : vaAlto ? `Algo por encima del ritmo · quedan €${eur(v.total - v.usado)}` : `Vas bien · quedan €${eur(v.total - v.usado)}`}
          </div>
          <ul className="presu-lista">
            {variables.map(i => {
              const g = Math.max(0, gastado[i.nombre] || 0), lim = Number(i.limite)
              const p = lim > 0 ? g / lim : 0
              const color = p > 1.001 ? 'var(--red)' : p > avanceMes + 0.15 ? 'var(--amber)' : 'var(--text2)'
              return (
                <li key={i.id} className="presu-var">
                  <span className="presu-nombre">{i.nombre}</span>
                  <span className="mono presu-monto" style={p > 1.001 ? { color: 'var(--red)' } : undefined}>€{eur(g)} <span>/ {eur(lim)}</span></span>
                  <Barra pct={p} color={color} alto={3} />
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {parteSuya > 0 && (
        <div className="presu-nota">Solo cuenta tu parte: €{eur(parteSuya)} de lo que pagaste es de Sofía (Compartidos).</div>
      )}
    </div>
  )
}
