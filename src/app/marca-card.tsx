'use client'

import { useMemo } from 'react'
import { totalACobrar } from '@/lib/importes'
import type { Marca } from '@/lib/marcas'

// Ingresos por marca: cobrado y pendiente de cobro del año, con el importe real que paga el
// cliente (IVA y retención incluidos si es de España). La marca sale solo de la columna
// `marca` de facturas; las que no la tienen van a «Sin marca» hasta que se asignen.
type F = { id: number; cliente: string; importe: number; fecha: string; estado: string; tipo_factura?: string | null; marca?: string | null; fiscal?: boolean | null }

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)
const MODO_TXT = { cerrado: 'agencia · precio cerrado', dia: 'por día', hora: 'por hora' }

export default function MarcaCard({ facturas, marcas, demo }: { facturas: F[]; marcas: Marca[]; demo: boolean }) {
  const anio = new Date().getFullYear()

  const filas = useMemo(() => {
    const acc = new Map<string, { cobrado: number; pendiente: number; n: number }>(marcas.map(m => [m.key, { cobrado: 0, pendiente: 0, n: 0 }]))
    for (const f of facturas) {
      if (f.fiscal === false) continue                       // registros internos (timesheet), no son facturas declaradas
      if (!f.fecha || new Date(f.fecha + 'T00:00:00').getFullYear() !== anio) continue
      const k = f.marca || ''
      if (!acc.has(k)) acc.set(k, { cobrado: 0, pendiente: 0, n: 0 })
      const fila = acc.get(k)!
      const total = totalACobrar(f)
      if (f.estado === 'cobrada') fila.cobrado += total; else fila.pendiente += total
      fila.n += 1
    }
    return Array.from(acc.entries())
  }, [facturas, marcas, anio])

  const max = Math.max(1, ...filas.map(([, v]) => v.cobrado + v.pendiente))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Ingresos por marca {demo && <span className="mono" style={{ fontSize: 10, marginLeft: 6, padding: '2px 6px', borderRadius: 4, background: 'var(--amber-dim)', color: 'var(--amber)' }}>DEMO</span>}</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>{anio} · importe a cobrar, con IVA y retención</div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)' }}>
          <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--green)', marginRight: 5 }} />cobrado</span>
          <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--amber)', marginRight: 5 }} />pendiente</span>
        </div>
      </div>
      {filas.map(([key, v]) => {
        const m = marcas.find(x => x.key === key)
        const total = v.cobrado + v.pendiente
        return (
          <div key={key || 'sin'} className="marca-fila">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: total ? 'var(--text)' : 'var(--text2)', fontSize: 13 }}>{m?.nombre || (key ? key : 'Sin marca')}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{m ? MODO_TXT[m.modo] : key ? 'no está en marcas' : 'por asignar'}</div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface3)', overflow: 'hidden', display: 'flex' }}>
              <i style={{ display: 'block', height: '100%', width: `${(v.cobrado / max) * 100}%`, background: 'var(--green)' }} />
              <i style={{ display: 'block', height: '100%', width: `${(v.pendiente / max) * 100}%`, background: 'var(--amber)' }} />
            </div>
            <div className="mono" style={{ textAlign: 'right', fontSize: 13 }}>
              {total ? eur(total) : '—'}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                {total ? `cobrado ${eur(v.cobrado)} · pendiente ${eur(v.pendiente)}` : 'sin facturas'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
