'use client'

import { useState } from 'react'
import type { Compra, Factura } from '@/lib/supabase'

const IVA = 0.21
const RETENCION = 0.15
const IRPF_130 = 0.20
const DIFICIL_JUSTIFICACION = 0.05
const DIFICIL_MAX_ANUAL = 2000
const PLAZOS = ['1–20 abr', '1–20 jul', '1–20 oct', '1–30 ene']

const eur = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

type Trimestre = {
  q: number
  ingresos: number; gastos: number; cuota: number
  rendimientoAcum: number; retencionesAcum: number; irpf: number
  ivaRep: number; ivaSop: number; iva: number
  estado: 'cerrado' | 'en curso' | 'futuro'
}

// Estimación directa simplificada (Modelo 130, acumulado desde enero) y
// Modelo 303 (trimestral). Es una aproximación: no contempla amortizaciones
// ni la deducción por rendimientos bajos.
function calcular(anio: number, facturas: Factura[], compras: Compra[], cuotaMensual: number): Trimestre[] {
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
    const irpf = Math.max(0, IRPF_130 * rendimientoAcum - retencionesAcum - pagosPrevios)
    pagosPrevios += irpf

    const ivaRep = sum(facturas.filter(delTrim).filter(esUe).map(f => Number(f.importe) * IVA))
    const ivaSop = sum(compras.filter(delTrim).map(c => ded(c) * Number(c.iva_pct) / 100))

    out.push({
      q,
      ingresos: sum(facturas.filter(delTrim).map(f => Number(f.importe))),
      gastos: sum(compras.filter(delTrim).map(ded)),
      cuota: cuotaMensual * 3,
      rendimientoAcum, retencionesAcum, irpf,
      ivaRep, ivaSop, iva: ivaRep - ivaSop,
      estado: hoy > fin ? 'cerrado' : hoy >= ini ? 'en curso' : 'futuro',
    })
  }
  return out
}

const btn: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const btnActivo: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)', fontWeight: 500 }
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const delTrimestre = (anio: number, q: number) => <T extends { fecha: string }>(x: T) =>
  x.fecha >= `${anio}-${String(q * 3 - 2).padStart(2, '0')}-01` && x.fecha <= `${anio}-${String(q * 3).padStart(2, '0')}-31`

export default function ImpuestosTab({ facturas, compras, cuotaMensual, onSaveCuota }: {
  facturas: Factura[]; compras: Compra[]; cuotaMensual: number; onSaveCuota: (n: number) => void
}) {
  const anioActual = new Date().getFullYear()
  const anios = Array.from(new Set([anioActual, ...facturas.map(f => Number(f.fecha.slice(0, 4))), ...compras.map(c => Number(c.fecha.slice(0, 4)))])).sort((a, b) => b - a)
  const [anio, setAnio] = useState(anioActual)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [cuota, setCuota] = useState(String(cuotaMensual || ''))
  const trims = calcular(anio, facturas, compras, cuotaMensual)

  const filas: [string, (t: Trimestre) => string, boolean?][] = [
    ['Ingresos del trimestre', t => `€${eur(t.ingresos)}`],
    ['Gastos deducibles', t => `−€${eur(t.gastos)}`],
    ['Cuota de autónomo', t => `−€${eur(t.cuota)}`],
    ['Rendimiento acumulado', t => `€${eur(t.rendimientoAcum)}`],
    ['Retenciones acumuladas', t => `€${eur(t.retencionesAcum)}`],
    ['IRPF · Modelo 130', t => `€${eur(t.irpf)}`, true],
    ['IVA cobrado', t => `€${eur(t.ivaRep)}`],
    ['IVA de tus compras', t => `−€${eur(t.ivaSop)}`],
    ['IVA · Modelo 303', t => t.iva < 0 ? `a compensar €${eur(-t.iva)}` : `€${eur(t.iva)}`, true],
    ['Total a apartar', t => `€${eur(t.irpf + Math.max(0, t.iva))}`, true],
  ]

  const ventasQ = abierto ? facturas.filter(delTrimestre(anio, abierto)).sort((a, b) => a.fecha.localeCompare(b.fecha)) : []
  const comprasQ = abierto ? compras.filter(delTrimestre(anio, abierto)).sort((a, b) => a.fecha.localeCompare(b.fecha)) : []

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {anios.map(a => (
            <button key={a} style={a === anio ? btnActivo : btn} onClick={() => { setAnio(a); setAbierto(null) }}>{a}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11.5, color: 'var(--text3)' }}>Cuota autónomo / mes €</label>
          <input type="number" value={cuota} onChange={e => setCuota(e.target.value)} onBlur={() => onSaveCuota(Number(cuota) || 0)}
            style={{ width: 90, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th />
              {trims.map(t => (
                <th key={t.q} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 500, color: t.estado === 'futuro' ? 'var(--text3)' : 'var(--text)' }}>
                  T{t.q}
                  <div style={{ fontSize: 10, fontWeight: 400, color: t.estado === 'en curso' ? 'var(--accent)' : 'var(--text3)' }}>
                    {t.estado === 'en curso' ? 'en curso' : t.estado === 'futuro' ? '—' : `se presenta ${PLAZOS[t.q - 1]}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(([nombre, valor, destacar]) => (
              <tr key={nombre} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', color: destacar ? 'var(--text)' : 'var(--text2)', fontWeight: destacar ? 600 : 400 }}>{nombre}</td>
                {trims.map(t => (
                  <td key={t.q} className="mono" style={{ padding: '8px 10px', textAlign: 'right', fontWeight: destacar ? 600 : 400, color: t.estado === 'futuro' ? 'var(--text3)' : destacar ? 'var(--amber)' : 'var(--text2)' }}>
                    {t.estado === 'futuro' ? '—' : valor(t)}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 10px', color: 'var(--text3)', fontSize: 11.5 }}>Facturas</td>
              {trims.map(t => {
                const n = facturas.filter(delTrimestre(anio, t.q)).length + compras.filter(delTrimestre(anio, t.q)).length
                return (
                  <td key={t.q} style={{ padding: '10px 10px', textAlign: 'right' }}>
                    {n > 0 && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button style={abierto === t.q ? btnActivo : btn} onClick={() => setAbierto(abierto === t.q ? null : t.q)}>Ver {n}</button>
                        <a style={{ ...btn, textDecoration: 'none' }} href={`/api/trimestre/zip?anio=${anio}&q=${t.q}`} title={`Descargar ZIP de T${t.q} ${anio}`}>ZIP</a>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {abierto && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>T{abierto} {anio} · {ventasQ.length} ventas · {comprasQ.length} compras</div>
            <button style={btn} onClick={() => setAbierto(null)}>Cerrar</button>
          </div>
          {ventasQ.map(f => (
            <div key={`v${f.id}`} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="mono" style={{ width: 110, color: 'var(--text)' }}>{f.numero || '—'}</span>
              <span style={{ width: 56, color: 'var(--text3)' }}>{fechaCorta(f.fecha)}</span>
              <span style={{ flex: 1, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.cliente}{f.descripcion ? ` · ${f.descripcion}` : ''}</span>
              <span className="mono" style={{ color: 'var(--text2)' }}>€{eur(Number(f.importe))}</span>
            </div>
          ))}
          {comprasQ.map(c => (
            <div key={`c${c.id}`} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 110, color: 'var(--text3)' }}>Compra</span>
              <span style={{ width: 56, color: 'var(--text3)' }}>{fechaCorta(c.fecha)}</span>
              <span style={{ flex: 1, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.proveedor}{c.concepto ? ` · ${c.concepto}` : ''}</span>
              <span className="mono" style={{ color: 'var(--text2)' }}>−€{eur(Number(c.base))}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
        Aproximación, no sustituye a tu gestor. IRPF (130): 20% del rendimiento acumulado desde enero (ingresos − gastos deducibles − cuota de autónomo − 5% de gastos de difícil justificación, máx. 2.000€/año), menos las retenciones del 15% de clientes españoles y lo ya pagado en trimestres anteriores.
        IVA (303): 21% de las facturas a clientes españoles menos el IVA deducible de tus compras. No incluye amortizaciones de compras grandes (más de 300€) ni la deducción por rendimientos bajos.
        El ZIP trae los PDF de las ventas (el original si es una factura ya declarada), los archivos de las compras y un resumen en CSV.
      </div>
    </div>
  )
}
