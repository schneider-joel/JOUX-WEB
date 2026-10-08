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

// Línea corta junto a la cifra de cada partida (sin pista de ancho completo).
function Linea({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="presu-linea" aria-hidden="true">
      <span style={{ width: `${Math.min(100, Math.max(pct > 0 ? 6 : 0, pct * 100))}%`, background: color }} />
    </span>
  )
}

type Partida = { id: number; nombre: string; gastado: number; limite: number }

// Una tarjeta por bloque (fijos / variables), con el mismo diseño de fila.
function BloquePresupuesto({ titulo, partidas, estado, colorDe, nota }: {
  titulo: string
  partidas: Partida[]
  estado: { texto: string; color: string }
  colorDe: (p: Partida) => string
  nota?: string
}) {
  const usado = partidas.reduce((s, p) => s + p.gastado, 0)
  const total = partidas.reduce((s, p) => s + p.limite, 0)
  return (
    <div className="card presu-card">
      <div className="presu-cabecera">
        <div className="card-title">{titulo}</div>
        <div className="mono presu-cifra">€{eur(usado)} <span>/ €{eur(total)}</span></div>
      </div>
      <div className="presu-estado" style={{ color: estado.color }}>{estado.texto}</div>
      <ul className="presu-lista">
        {partidas.map(p => {
          const pct = p.limite > 0 ? p.gastado / p.limite : 0
          const color = colorDe(p)
          return (
            <li key={p.id}>
              <span className="presu-nombre">{p.nombre}</span>
              <Linea pct={pct} color={color} />
              <span className="mono presu-monto" style={pct > 1.001 ? { color: 'var(--red)' } : undefined}>€{eur(p.gastado)} <span>/ {eur(p.limite)}</span></span>
            </li>
          )
        })}
      </ul>
      {nota && <div className="presu-nota">{nota}</div>}
    </div>
  )
}

// Presupuesto del mes: dos tarjetas (fijos y variables) para el grid del overview.
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

  return (
    <>
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
    </>
  )
}
