'use client'

import type { PresupuestoItem } from '@/lib/supabase'
import { deudaDe, type GastoCompartido } from '@/lib/compartidos'

type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

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

function Anillo({ pct, color }: { pct: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface3)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${Math.min(1, pct) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)" fontFamily="JetBrains Mono, monospace">{Math.round(pct * 100)}%</text>
    </svg>
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

  const bloque = (titulo: string, items: PresupuestoItem[], esFijo: boolean) => {
    const total = items.reduce((s, i) => s + Number(i.limite), 0)
    const usado = items.reduce((s, i) => s + Math.max(0, gastado[i.nombre] || 0), 0)
    const pct = total > 0 ? usado / total : 0
    // Variables: comparado con lo que llevas de mes. Fijos: lo que falta pagar.
    const estado = esFijo
      ? { color: pct >= 0.999 ? 'var(--green)' : 'var(--accent)', texto: pct >= 0.999 ? 'Todo pagado' : `Quedan €${eur(Math.max(0, total - usado))} por pagar` }
      : pct > avanceMes + 0.1
        ? { color: 'var(--amber)', texto: `Por encima del ritmo (día ${hoy.getDate()} de ${diasMes})` }
        : { color: 'var(--green)', texto: `Vas bien · quedan €${eur(Math.max(0, total - usado))}` }
    return (
      <div className="presu-bloque">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <Anillo pct={pct} color={estado.color} />
          <div style={{ minWidth: 0 }}>
            <div className="card-kicker">{titulo}</div>
            <div className="mono" style={{ fontSize: 18, marginTop: 2 }}>€{eur(usado)} <span style={{ color: 'var(--text3)', fontSize: 13 }}>/ €{eur(total)}</span></div>
            <div style={{ fontSize: 11.5, color: estado.color, marginTop: 2 }}>{estado.texto}</div>
          </div>
        </div>
        {items.map(i => {
          const g = gastado[i.nombre] || 0
          const lim = Number(i.limite)
          const p = lim > 0 ? g / lim : 0
          const color = p > 1.001 ? 'var(--red)' : esFijo ? (p >= 0.999 ? 'var(--green)' : 'var(--accent)') : p > avanceMes + 0.15 ? 'var(--amber)' : 'var(--accent)'
          return (
            <div key={i.id} className="presu-fila">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <i style={{ width: 6, height: 6, borderRadius: 3, background: g > 0 ? color : 'var(--surface3)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nombre}</span>
                </span>
                <span className="mono" style={{ fontSize: 11.5, color: p > 1.001 ? 'var(--red)' : 'var(--text2)', flexShrink: 0 }}>
                  €{eur(g)} <span style={{ color: 'var(--text3)' }}>/ {eur(lim)}</span>{esFijo && p >= 0.999 ? ' ✓' : ''}
                </span>
              </div>
              <div className="presu-barra">
                <div style={{ width: `${Math.min(100, Math.max(g > 0 ? 3 : 0, p * 100))}%`, background: color }} />
                {!esFijo && <span style={{ left: `${avanceMes * 100}%` }} title="Ritmo del mes" />}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card card-fill">
      <div className="card-head">
        <div>
          <div className="card-title">Presupuesto de {nombreMes}</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>Desde tus movimientos del banco · día {hoy.getDate()} de {diasMes}</div>
        </div>
      </div>
      <div className="presu-grid">
        {bloque('Fijos', fijos, true)}
        {bloque('Variables', variables, false)}
      </div>
      {parteSuya > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
          Cada partida cuenta solo tu parte: €{eur(parteSuya)} de lo que pagaste le corresponde a Sofía (Compartidos).
        </div>
      )}
    </div>
  )
}
