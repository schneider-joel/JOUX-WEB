'use client'

import { useState } from 'react'
import type { Compra, Factura } from '@/lib/supabase'

const IVA = 0.21
const RETENCION = 0.15
const IRPF_130 = 0.20
const DIFICIL_JUSTIFICACION = 0.05
const DIFICIL_MAX_ANUAL = 2000
const PLAZOS = ['1–20 abr', '1–20 jul', '1–20 oct', '1–30 ene']

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

type Trimestre = {
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
    const dificil = Math.min(Math.max(0, neto) * DIFICIL_JUSTIFICACION, DIFICIL_MAX_ANUAL)
    const rendimientoAcum = neto - dificil
    const real = reales[`${anio}-${q}`] || {}
    const irpf = real.irpf ?? Math.max(0, IRPF_130 * rendimientoAcum - retencionesAcum - pagosPrevios)
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

const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const delTrimestre = (anio: number, q: number) => <T extends { fecha: string }>(x: T) =>
  x.fecha >= `${anio}-${String(q * 3 - 2).padStart(2, '0')}-01` && x.fecha <= `${anio}-${String(q * 3).padStart(2, '0')}-31`

// Una fila del desglose de un modelo: nombre, como mucho una línea pequeña e importe
function Paso({ n, s, v, tipo }: { n: string; s?: React.ReactNode; v: string; tipo?: 'sub' | 'tot' }) {
  return (
    <li className={`cr${tipo ? ` cr--${tipo}` : ''}${tipo === 'tot' ? ' sum' : ''}`}>
      <span className="cr__main"><span className="cr__n">{n}</span>{s && <span className="cr__s caps">{s}</span>}</span>
      <span className="num">{v}</span>
    </li>
  )
}

export default function ImpuestosTab({ facturas, compras, cuotaMensual, onSaveCuota, reales, onSaveReal }: {
  facturas: Factura[]; compras: Compra[]; cuotaMensual: number; onSaveCuota: (n: number) => void
  reales: Reales; onSaveReal: (anio: number, q: number, valor: { irpf?: number; iva?: number }) => void
}) {
  const anioActual = new Date().getFullYear()
  const anios = Array.from(new Set([anioActual, ...facturas.map(f => Number(f.fecha.slice(0, 4))), ...compras.map(c => Number(c.fecha.slice(0, 4)))])).sort((a, b) => b - a)
  const [anio, setAnio] = useState(anioActual)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [cuota, setCuota] = useState(String(cuotaMensual || ''))
  const trims = calcular(anio, facturas, compras, cuotaMensual, reales)
  // Trimestre que se ve (solo presentación): el del próximo pago si es de este año; si no, el que está en curso
  const [trimestre, setTrimestre] = useState(() => {
    const p = proximoPago(facturas, compras, cuotaMensual, reales)
    return p && p.anio === anioActual ? p.q : trims.find(t => t.estado === 'en curso')?.q ?? 4
  })
  const t = trims[trimestre - 1]
  const real = reales[`${anio}-${t.q}`] || {}
  const total = (x: Trimestre) => x.irpf + Math.max(0, x.iva)
  const max = Math.max(...trims.map(x => x.estado === 'futuro' ? 0 : total(x)))

  const ventasQ = abierto ? facturas.filter(delTrimestre(anio, abierto)).sort((a, b) => a.fecha.localeCompare(b.fecha)) : []
  const comprasQ = abierto ? compras.filter(delTrimestre(anio, abierto)).sort((a, b) => a.fecha.localeCompare(b.fecha)) : []
  const nVentas = facturas.filter(delTrimestre(anio, t.q)).length
  const nCompras = compras.filter(delTrimestre(anio, t.q)).length
  const n = nVentas + nCompras

  const campo = (k: 'irpf' | 'iva') => (
    <div className="field">
      <label className="caps" htmlFor={`gestor-${k}`}>{k === 'irpf' ? 'Modelo 130' : 'Modelo 303'} · €</label>
      <input id={`gestor-${k}`} key={`${anio}-${t.q}-${k}-${real[k] ?? ''}`} type="number" step="0.01" defaultValue={real[k] ?? ''} placeholder="—"
        onBlur={e => {
          const v = e.target.value === '' ? undefined : Number(e.target.value)
          if (v !== real[k]) onSaveReal(anio, t.q, { ...real, [k]: v })
        }} />
    </div>
  )

  const [punto, estado] = t.estado === 'futuro' ? ['dot--off', 'Sin empezar']
    : t.estado === 'en curso' ? ['dot--off', `En curso · se presenta ${PLAZOS[t.q - 1]}`]
    : t.declarado ? ['dot--ok', 'Presentado (gestor)'] : ['dot--amber', `Se presenta ${PLAZOS[t.q - 1]}`]

  return (
    <div className="col imp">
      {/* Lo que hay que apartar del trimestre elegido: la cifra grande; el trimestre, en la etiqueta */}
      <section className="block" aria-label="Total a apartar">
        <p className="label caps"><span>A apartar · {anio}</span><i className="rule" />
          <span className="seg" role="group" aria-label="Trimestre">
            {trims.map(x => <button key={x.q} type="button" aria-pressed={x.q === trimestre} onClick={() => setTrimestre(x.q)}>T{x.q}</button>)}
          </span>
        </p>
        <div className="hero">
          <p className="big">{t.estado === 'futuro' ? '—' : `€${eur(total(t))}`}</p>
          <p className="delta caps"><i className={`dot ${punto}`} aria-hidden="true" /><span>{estado}</span></p>
        </div>
        {/* Importes del gestor: sustituyen a la estimación; solo en los trimestres cerrados */}
        {t.estado === 'cerrado' && (
          <div className="gestor">
            <p className="gestor__t">{t.declarado ? <><i className="dot dot--ok" aria-hidden="true" />Importes del gestor</> : 'Importes del gestor: sin apuntar, cuenta la estimación'}</p>
            <div className="gestor__campos">{campo('irpf')}{campo('iva')}</div>
          </div>
        )}
      </section>

      {t.estado === 'futuro' ? <p className="empty">El T{t.q} todavía no ha empezado.</p> : (<>
        <section className="block" aria-label="IVA, modelo 303">
          <p className="label caps"><span>IVA · 303</span><i className="rule" /></p>
          <ul className="calc">
            <Paso n="IVA cobrado" s="21 % de lo facturado en España" v={`€${eur(t.ivaRep)}`} />
            <Paso n="IVA de tus compras" s="IVA deducible de las compras" v={`−€${eur(t.ivaSop)}`} />
            <Paso n={t.iva < 0 ? 'A compensar' : 'A ingresar'} tipo="tot" v={`€${eur(Math.abs(t.iva))}`}
              s={real.iva !== undefined ? <><i className="dot dot--ok" aria-hidden="true" />Del gestor</> : 'Estimación'} />
          </ul>
        </section>

        <section className="block" aria-label="IRPF, modelo 130">
          <p className="label caps"><span>IRPF · 130</span><i className="rule" /></p>
          <ul className="calc">
            <Paso n="Ingresos del trimestre" v={`€${eur(t.ingresos)}`} />
            <Paso n="Gastos deducibles" s="Base deducible de las compras" v={`−€${eur(t.gastos)}`} />
            <Paso n="Cuota de autónomo" s="Tres meses" v={`−€${eur(t.cuota)}`} />
            <Paso n="Rendimiento acumulado" s="Desde enero" v={`€${eur(t.rendimientoAcum)}`} tipo="sub" />
            <Paso n="Retenciones acumuladas" s="15 % de lo facturado en España" v={`€${eur(t.retencionesAcum)}`} />
            <Paso n="A ingresar" tipo="tot" v={`€${eur(t.irpf)}`}
              s={real.irpf !== undefined ? <><i className="dot dot--ok" aria-hidden="true" />Del gestor</> : 'Estimación'} />
          </ul>
        </section>
      </>)}

      {/* Los cuatro trimestres: presentado (lleno), por presentar (rayado) o en curso (discontinuo) */}
      <section className="block" aria-label="Por trimestre">
        <p className="label caps"><span>Por trimestre</span><i className="rule" />
          {anios.length > 1 && (
            <span className="seg" role="group" aria-label="Año">
              {anios.map(a => <button key={a} type="button" aria-pressed={a === anio} onClick={() => { setAnio(a); setAbierto(null) }}>{a}</button>)}
            </span>
          )}
        </p>
        <ul className="qs focus">
          {trims.map((x, i) => {
            const cls = x.estado === 'futuro' ? '' : x.declarado ? ' is-ok' : x.estado === 'cerrado' ? ' is-p' : ' is-e'
            return (
              <li key={x.q}>
                <button type="button" className={`qb${x.q === trimestre ? ' is-on' : ''}`} aria-pressed={x.q === trimestre} onClick={() => setTrimestre(x.q)}>
                  <span className="qb__k caps">T{x.q}</span>
                  <span className="qb__t">{x.estado !== 'futuro' && <i className={`qb__f${cls}`} style={{ '--w': max ? total(x) / max : 0, '--i': i } as React.CSSProperties} />}</span>
                  <span className="num">{x.estado === 'futuro' ? '—' : `€${eur(total(x))}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="legend caps"><span><i className="sw" />Presentado</span><span><i className="sw sw--p" />Por presentar</span><span><i className="sw sw--e" />En curso</span></div>
      </section>

      <section className="block" aria-label="Cuota de autónomo">
        <p className="label caps"><span>Autónomo</span><i className="rule" /></p>
        <div className="field imp__cuota">
          <label className="caps" htmlFor="cuota-autonomo">Cuota mensual · €</label>
          <input id="cuota-autonomo" type="number" value={cuota} onChange={e => setCuota(e.target.value)} onBlur={() => onSaveCuota(Number(cuota) || 0)} />
        </div>
      </section>

      {/* ZIP del trimestre para el gestor y, al desplegar, sus ventas y compras */}
      <section className="block" aria-label="Para el gestor">
        <p className="label caps"><span>Para el gestor</span><i className="rule" /></p>
        {n === 0 ? <p className="empty">No hay ventas ni compras en el T{t.q} de {anio}.</p> : (
          <div className="zip">
            <p className="zip__main">
              <span className="zip__n">{anio} - T{t.q}.zip</span>
              <span className="zip__s caps">{nVentas} {nVentas === 1 ? 'venta' : 'ventas'} · {nCompras} {nCompras === 1 ? 'compra' : 'compras'} · Resumen.csv</span>
            </p>
            <span className="zip__acts">
              <button type="button" className="copy caps hit" aria-expanded={abierto === t.q} onClick={() => setAbierto(abierto === t.q ? null : t.q)}>{abierto === t.q ? 'Cerrar' : `Ver ${n}`}</button>
              <a className="pill pill--sm" href={`/api/trimestre/zip?anio=${anio}&q=${t.q}`} title={`Descargar ZIP de T${t.q} ${anio}`}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3.5 13.5h9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Descargar ZIP
              </a>
            </span>
          </div>
        )}
        {abierto === t.q && (
          <ul className="ln">
            {ventasQ.map(f => (
              <li key={`v${f.id}`}>
                <span className="ln__m"><span className="ln__t">{f.cliente}{f.descripcion && <span className="dim"> · {f.descripcion}</span>}</span><span className="ln__s caps">{f.numero || '—'} · {fechaCorta(f.fecha)}</span></span>
                <span className="num">€{eur(Number(f.importe))}</span>
              </li>
            ))}
            {comprasQ.map(c => (
              <li key={`c${c.id}`}>
                <span className="ln__m"><span className="ln__t">{c.proveedor}{c.concepto && <span className="dim"> · {c.concepto}</span>}</span><span className="ln__s caps">Compra · {fechaCorta(c.fecha)}</span></span>
                <span className="num">−€{eur(Number(c.base))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="nota imp__nota">
        Aproximación, no sustituye a tu gestor. Cuando el gestor te pase los importes de un trimestre, apúntalos en «Importes del gestor»: sustituyen a la estimación (también en la tarjeta del IRPF) y se descuentan del 130 de los trimestres siguientes. IRPF (130): 20% del rendimiento acumulado desde enero (ingresos − gastos deducibles − cuota de autónomo − 5% de gastos de difícil justificación, máx. 2.000€/año), menos las retenciones del 15% de clientes españoles y lo ya pagado en trimestres anteriores.
        IVA (303): 21% de las facturas a clientes españoles menos el IVA deducible de tus compras. No incluye amortizaciones de compras grandes (más de 300€) ni la deducción por rendimientos bajos.
        El ZIP trae los PDF de las ventas (el original si es una factura ya declarada), los archivos de las compras y un resumen en CSV.
      </p>
    </div>
  )
}
