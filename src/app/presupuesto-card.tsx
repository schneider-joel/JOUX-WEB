'use client'

import { useState } from 'react'
import type { PresupuestoItem } from '@/lib/supabase'
import type { GastoCompartido } from '@/lib/compartidos'
import { gastadoPorPartida, type Mov } from '@/lib/presupuesto'
export { gastadoPorPartida, PARTE_PAREJA_ALQUILER } from '@/lib/presupuesto'

// 'always': en es-ES los números de 4 cifras no llevan separador por defecto (2005 → 2.005).
const eur = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.round(n))

// Línea corta junto a la cifra de cada partida (sin pista de ancho completo).
function Linea({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="mini" aria-hidden="true">
      <i style={{ width: `${Math.min(100, Math.max(pct > 0 ? 6 : 0, pct * 100))}%`, background: color }} />
    </span>
  )
}

type Partida = { id: number; nombre: string; gastado: number; limite: number }

// Un bloque (fijos / variables): total, estado y barra; las partidas, al desplegar.
function BloquePresupuesto({ titulo, partidas, estado, colorDe, nota }: {
  titulo: string
  partidas: Partida[]
  estado: { texto: string; color: string }
  colorDe: (p: Partida) => string
  nota?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const usado = partidas.reduce((s, p) => s + p.gastado, 0)
  const total = partidas.reduce((s, p) => s + p.limite, 0)
  const pct = total > 0 ? Math.min(1, usado / total) : 0
  return (
    <div className={`bud${abierto ? ' is-open' : ''}`}>
      <button type="button" className="bud__head" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span className="bud__top">
          <span>{titulo}</span>
          <span className="num bud__v"><b>€{eur(usado)}</b> / €{eur(total)}</span>
          <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="bud__s caps" style={{ color: estado.color }}>{estado.texto}</span>
        <span className="bud__bar" aria-hidden="true"><i style={{ transform: `scaleX(${pct})`, background: estado.color === 'var(--text3)' ? 'var(--text)' : estado.color }} /></span>
      </button>
      {abierto && (
        <div className="bud__det">
          <ul className="bud__lista">
            {partidas.map(p => {
              const pp = p.limite > 0 ? p.gastado / p.limite : 0
              const color = colorDe(p)
              return (
                <li key={p.id}>
                  <span className="bud__n">{p.nombre}</span>
                  <Linea pct={pp} color={color} />
                  <span className="num bud__m" style={pp > 1.001 ? { color: 'var(--red)' } : undefined}>€{eur(p.gastado)} <span>/ {eur(p.limite)}</span></span>
                </li>
              )
            })}
          </ul>
          {nota && <p className="nota">{nota}</p>}
        </div>
      )}
    </div>
  )
}

// Presupuesto del mes: fijos y variables, a dos columnas.
export default function PresupuestoCards({ fijos, variables, movimientos, compartidos = null }: { fijos: PresupuestoItem[]; variables: PresupuestoItem[]; movimientos: Mov[]; compartidos?: GastoCompartido[] | null }) {
  if (!movimientos.length) return null
  const gastado = gastadoPorPartida(movimientos, new Set(variables.map(v => v.nombre)), undefined, compartidos)
  const parteSuya = gastado.__parteSuya || 0
  const hoy = new Date()
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const avanceMes = hoy.getDate() / diasMes

  const partidas = (items: PresupuestoItem[]): Partida[] => items.map(i => ({ id: i.id, nombre: i.nombre, gastado: Math.max(0, gastado[i.nombre] || 0), limite: Number(i.limite) }))
  const pf = partidas(fijos), pv = partidas(variables)
  const sum = (ps: Partida[], k: 'gastado' | 'limite') => ps.reduce((s, p) => s + p[k], 0)
  const faltaF = sum(pf, 'limite') - sum(pf, 'gastado')
  const usadoV = sum(pv, 'gastado'), totalV = sum(pv, 'limite')
  const pctV = totalV > 0 ? usadoV / totalV : 0

  const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long' })
  return (
    <section className="block" aria-label="Presupuesto">
      <p className="label caps"><span>Presupuesto</span><i className="rule" /><span className="label__m">{nombreMes}</span></p>
      <div className="budget">
        <BloquePresupuesto
          titulo="Fijos"
          partidas={pf}
          estado={faltaF <= 0.5 ? { texto: 'Todo pagado', color: 'var(--green)' } : { texto: `Quedan €${eur(faltaF)} por pagar`, color: 'var(--text3)' }}
          colorDe={p => (p.gastado >= p.limite * 0.95 ? 'var(--green)' : 'var(--text2)')}
          nota={parteSuya > 0 ? `Solo cuenta tu parte: €${eur(parteSuya)} de lo que pagaste es de Sofía.` : undefined}
        />
        <BloquePresupuesto
          titulo="Variables"
          partidas={pv}
          estado={pctV > 1
            ? { texto: `Te has pasado €${eur(usadoV - totalV)}`, color: 'var(--red)' }
            : pctV > avanceMes + 0.1
              ? { texto: `Algo por encima del ritmo · quedan €${eur(totalV - usadoV)}`, color: 'var(--amber)' }
              : { texto: `Vas bien · quedan €${eur(totalV - usadoV)}`, color: 'var(--text3)' }}
          colorDe={p => (p.gastado > p.limite ? 'var(--red)' : p.gastado / p.limite > avanceMes + 0.15 ? 'var(--amber)' : 'var(--text)')}
        />
      </div>
    </section>
  )
}
