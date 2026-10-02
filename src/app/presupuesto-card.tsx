'use client'

import type { PresupuestoItem } from '@/lib/supabase'

type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

// Gastado este mes en cada partida, a partir de los movimientos del banco
// (las devoluciones restan). Solo cuenta lo clasificado como gasto; las
// compras de trabajo no gastan de las partidas indicadas (las variables).
export function gastadoPorPartida(movs: Mov[], sinTrabajo: Set<string> = new Set(), mes = new Date().toISOString().slice(0, 7)) {
  const out: Record<string, number> = {}
  for (const m of movs) {
    if (!m.fecha.startsWith(mes) || m.clase !== 'gasto' || !m.categoria) continue
    if (m.trabajo && sinTrabajo.has(m.categoria)) continue
    out[m.categoria] = (out[m.categoria] || 0) - Number(m.importe)
  }
  return out
}

export default function PresupuestoCard({ fijos, variables, movimientos }: { fijos: PresupuestoItem[]; variables: PresupuestoItem[]; movimientos: Mov[] }) {
  if (!movimientos.length) return null
  const gastado = gastadoPorPartida(movimientos, new Set(variables.map(v => v.nombre)))
  const nombreMes = new Date().toLocaleDateString('es-ES', { month: 'long' })
  const hoy = new Date()
  const avanceMes = hoy.getDate() / new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()

  const bloque = (titulo: string, items: PresupuestoItem[], esFijo: boolean) => {
    const total = items.reduce((s, i) => s + Number(i.limite), 0)
    const usado = items.reduce((s, i) => s + (gastado[i.nombre] || 0), 0)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          <span>{titulo}</span><span className="mono">€{eur(usado)} / €{eur(total)}</span>
        </div>
        {items.map(i => {
          const g = gastado[i.nombre] || 0
          const lim = Number(i.limite)
          const pct = lim > 0 ? g / lim : 0
          // Variables: ámbar si vas por encima del ritmo del mes; rojo si te pasaste.
          const color = pct > 1.001 ? 'var(--red)' : !esFijo && pct > avanceMes + 0.15 ? 'var(--amber)' : esFijo && pct >= 0.999 ? 'var(--green)' : 'var(--accent)'
          return (
            <div key={i.id} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span>{i.nombre}</span>
                <span className="mono" style={{ color: pct > 1.001 ? 'var(--red)' : 'var(--text2)' }}>
                  €{eur(g)} <span style={{ color: 'var(--text3)' }}>/ €{eur(lim)}</span>
                  {esFijo && pct >= 0.999 && ' ✓'}
                </span>
              </div>
              <div className="acct-bar-track"><div className="acct-bar-fill" style={{ width: `${Math.min(100, Math.max(g > 0 ? 2 : 0, pct * 100))}%`, background: color }} /></div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Presupuesto de {nombreMes}</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>Calculado solo con tus movimientos del banco · clasifícalos en Bancos</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
        {bloque('Fijos', fijos, true)}
        {bloque('Variables', variables, false)}
      </div>
    </div>
  )
}
