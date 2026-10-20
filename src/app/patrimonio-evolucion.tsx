'use client'

import { useEffect, useRef, useState } from 'react'
import type { PatrimonioSnapshot } from '@/lib/supabase'

// Evolución del patrimonio (Finanzas › Patrimonio): un punto por día guardado (patrimonio_snapshots,
// se guarda al abrir el hub) y el de ahora. Periodo 3 meses / 12 meses / todo; con el ratón (o el dedo)
// una línea marca el día y una etiqueta dice cuánto había. Solo presentación.

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))
const fechaLarga = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
const mesCorto = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
type Periodo = '3m' | '12m' | 'todo'
const MESES: Record<Periodo, number | null> = { '3m': 3, '12m': 12, todo: null }

// `proyeccion`: el valor estimado dentro de 30 días, en línea discontinua desde hoy.
export default function PatrimonioEvolucion({ snapshots, actual, hoy, proyeccion }: { snapshots: PatrimonioSnapshot[]; actual: number; hoy: string; proyeccion?: { fecha: string; valor: number } }) {
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [sel, setSel] = useState<number | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Un punto por día (el último del día manda) y hoy con el valor en vivo.
  const porDia = new Map<string, number>()
  for (const s of [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha))) porDia.set(s.fecha, Number(s.total))
  porDia.set(hoy, actual)
  const meses = MESES[periodo]
  const desde = meses ? (() => { const d = new Date(hoy + 'T00:00:00'); d.setMonth(d.getMonth() - meses); return d.toISOString().slice(0, 10) })() : ''
  const puntos = Array.from(porDia, ([fecha, v]) => ({ fecha, v })).filter(p => p.fecha >= desde).sort((a, b) => a.fecha.localeCompare(b.fecha))

  const h = 240, pl = 52, pr = 12, pt = 12, pb = 26
  const t = (iso: string) => new Date(iso + 'T00:00:00').getTime()
  const t0 = puntos.length ? t(puntos[0].fecha) : 0, t1 = proyeccion ? t(proyeccion.fecha) : puntos.length ? t(puntos[puntos.length - 1].fecha) : 1
  const vals = [...puntos.map(p => p.v), ...(proyeccion ? [proyeccion.valor] : [])]
  const bruto = { min: Math.min(...vals), max: Math.max(...vals) }
  const margen = Math.max(500, (bruto.max - bruto.min) * 0.15)
  const mn = Math.max(0, Math.floor((bruto.min - margen) / 1000) * 1000), mx = Math.ceil((bruto.max + margen) / 1000) * 1000
  const x = (iso: string) => t1 === t0 ? (pl + w - pr) / 2 : pl + (t(iso) - t0) / (t1 - t0) * (w - pl - pr)
  const y = (v: number) => pt + (1 - (v - mn) / (mx - mn || 1)) * (h - pt - pb)
  const paso = (mx - mn) / 3
  const lineas = [0, 1, 2, 3].map(i => mn + paso * i)
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  // Etiquetas del eje: el día 1 de cada mes del periodo (como mucho 7).
  const marcas: string[] = []
  if (puntos.length) {
    const c = new Date(puntos[0].fecha + 'T00:00:00'); c.setDate(1); c.setMonth(c.getMonth() + 1)
    while (c.getTime() <= t1) { marcas.push(c.toISOString().slice(0, 10)); c.setMonth(c.getMonth() + 1) }
  }
  const cada = Math.ceil(marcas.length / 7) || 1
  const p = sel != null ? puntos[sel] : null

  const mover = (clientX: number) => {
    const r = caja.current?.getBoundingClientRect()
    if (!r || !puntos.length) return
    const px = (clientX - r.left) * w / r.width
    let mejor = 0
    for (let i = 1; i < puntos.length; i++) if (Math.abs(x(puntos[i].fecha) - px) < Math.abs(x(puntos[mejor].fecha) - px)) mejor = i
    setSel(mejor)
  }

  return (
    <div className="pt__evo">
      <div className="seg caps pt__seg" role="group" aria-label="Periodo">
        {(['3m', '12m', 'todo'] as Periodo[]).map(k => <button key={k} type="button" aria-pressed={periodo === k} onClick={() => { setPeriodo(k); setSel(null) }}>{k === 'todo' ? 'Todo' : k === '3m' ? '3 meses' : '12 meses'}</button>)}
      </div>
      <div className="pt__chart" ref={caja} onPointerMove={e => mover(e.clientX)} onPointerDown={e => mover(e.clientX)} onPointerLeave={() => setSel(null)}>
        {puntos.length < 2 ? <p className="nota">Aún no hay historial en este periodo: se guarda un punto cada día que abres el hub.</p> : (
          <svg viewBox={`0 0 ${w} ${h}`} height={h} role="img" aria-label={`Patrimonio de ${fechaLarga(puntos[0].fecha)} a hoy: de €${fmt(puntos[0].v)} a €${fmt(actual)}`}>
            {lineas.map(v => <g key={v}><line className="pt__grid" x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} /><text className="pt__ax" x={pl - 8} y={y(v) + 3} textAnchor="end">{Math.round(v / 1000)}k</text></g>)}
            {marcas.filter((_, i) => i % cada === 0).map(m => <text key={m} className="pt__ax" x={x(m)} y={h - 6} textAnchor="middle">{mesCorto(m)}</text>)}
            <path className="pt__area" d={`${d} L${x(puntos[puntos.length - 1].fecha)},${y(mn)} L${x(puntos[0].fecha)},${y(mn)} Z`} />
            <path className="pt__ln" d={d} />
            {proyeccion && <>
              <line className="pt__proyl" x1={x(hoy)} y1={y(actual)} x2={x(proyeccion.fecha)} y2={y(proyeccion.valor)} />
              <circle className="pt__proyp" r="4" cx={x(proyeccion.fecha)} cy={y(proyeccion.valor)} />
              <text className="pt__ax" x={x(proyeccion.fecha)} y={y(proyeccion.valor) - 10} textAnchor="end">+30 d</text>
            </>}
            <circle className="pt__fin" r="4.5" cx={x(puntos[puntos.length - 1].fecha)} cy={y(puntos[puntos.length - 1].v)} />
            {p && <><line className="pt__cruz" x1={x(p.fecha)} x2={x(p.fecha)} y1={pt} y2={h - pb} /><circle className="pt__fin" r="4" cx={x(p.fecha)} cy={y(p.v)} /></>}
          </svg>
        )}
        {p && <div className="pt__tip" style={{ left: `${x(p.fecha) / w * 100}%`, top: y(p.v) }}><span>{fechaLarga(p.fecha)}</span> <b>€{fmt(p.v)}</b></div>}
      </div>
    </div>
  )
}
