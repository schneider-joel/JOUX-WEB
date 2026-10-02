'use client'

import type { PresupuestoItem } from '@/lib/supabase'

type Mov = { fecha: string; importe: number; categoria: string | null; clase: string | null; trabajo?: boolean }

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

// Parte del alquiler que paga la pareja (el alquiler sale entero de tu cuenta
// y ella te devuelve su mitad junto con otros gastos compartidos).
export const PARTE_PAREJA_ALQUILER = 0.5

// Gastado este mes en cada partida, a partir de los movimientos del banco
// (las devoluciones restan). Solo cuenta lo clasificado como gasto; las
// compras de trabajo no gastan de las partidas indicadas (las variables).
// Los reembolsos descuentan primero su parte del alquiler; lo que sobra son
// gastos compartidos devueltos (compartidos).
export function gastadoPorPartida(movs: Mov[], sinTrabajo: Set<string> = new Set(), mes = new Date().toISOString().slice(0, 7)) {
  const out: Record<string, number> = {}
  let reembolsos = 0
  for (const m of movs) {
    if (!m.fecha.startsWith(mes)) continue
    if (m.clase === 'reembolso') { reembolsos += Number(m.importe); continue }
    if (m.clase !== 'gasto' || !m.categoria) continue
    if (m.trabajo && sinTrabajo.has(m.categoria)) continue
    out[m.categoria] = (out[m.categoria] || 0) - Number(m.importe)
  }
  const alquiler = Math.min(reembolsos, Math.max(0, (out['Alquiler'] || 0) * PARTE_PAREJA_ALQUILER))
  if (alquiler) out['Alquiler'] -= alquiler
  return Object.assign(out, { __reembolsoAlquiler: alquiler, __compartidos: reembolsos - alquiler })
}

export default function PresupuestoCard({ fijos, variables, movimientos }: { fijos: PresupuestoItem[]; variables: PresupuestoItem[]; movimientos: Mov[] }) {
  if (!movimientos.length) return null
  const gastado = gastadoPorPartida(movimientos, new Set(variables.map(v => v.nombre)))
  const reembolsoAlquiler = gastado.__reembolsoAlquiler || 0
  const compartidos = gastado.__compartidos || 0
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
      {(reembolsoAlquiler > 0 || compartidos > 0) && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          Te devolvieron €{eur(reembolsoAlquiler + compartidos)}: €{eur(reembolsoAlquiler)} de su parte del alquiler (ya descontada arriba)
          {compartidos > 0 && <> y €{eur(compartidos)} de gastos compartidos, que reducen lo que gastas tú en el mes</>}.
        </div>
      )}
    </div>
  )
}
