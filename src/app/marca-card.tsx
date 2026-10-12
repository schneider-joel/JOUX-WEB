'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { totalACobrar } from '@/lib/importes'

// Ingresos por marca: cobrado y pendiente de cobro del año, con el importe real que paga el
// cliente (IVA y retención incluidos si es de España). La marca sale de la columna `marca`
// cuando exista; mientras tanto, de la descripción de la factura: «Arkevo · …».
// Con ?demo=marcas en la dirección se muestran datos de ejemplo (no lee ni escribe nada).
type F = { id: number; cliente: string; descripcion?: string | null; importe: number; fecha: string; estado: string; tipo_factura?: string | null; marca?: string | null; fiscal?: boolean | null }

export const marcaDe = (f: F): string => f.marca || (/^\s*arkevo\b/i.test(f.descripcion || '') ? 'arkevo' : 'otras')

const NOMBRE: Record<string, string> = { arkevo: 'Arkevo', otras: 'Resto' }
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const DEMO: F[] = [
  { id: -1, cliente: 'Estudio Ejemplo SL', descripcion: 'Arkevo · Web plan Studio · 50 % al empezar', importe: 1950, fecha: new Date().toISOString().slice(0, 10), estado: 'cobrada', tipo_factura: 'dentro_ue' },
  { id: -2, cliente: 'Estudio Ejemplo SL', descripcion: 'Arkevo · Web plan Studio · 50 % al publicar', importe: 1950, fecha: new Date().toISOString().slice(0, 10), estado: 'pendiente', tipo_factura: 'dentro_ue' },
  { id: -3, cliente: 'Construcciones Muestra', descripcion: 'Arkevo · Web plan Essential · 50 % al empezar', importe: 495, fecha: new Date().toISOString().slice(0, 10), estado: 'pendiente', tipo_factura: 'dentro_ue' },
]

export default function MarcaCard() {
  const [facturas, setFacturas] = useState<F[]>([])
  const [demo, setDemo] = useState(false)
  const anio = new Date().getFullYear()

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === 'marcas') { setDemo(true); setFacturas(DEMO); return }
    // select('*'): sirve con o sin la columna `marca`.
    supabase.from('facturas').select('*').order('fecha', { ascending: false }).then(r => setFacturas((r.data || []) as F[]))
  }, [])

  const filas = useMemo(() => {
    const acc: Record<string, { cobrado: number; pendiente: number; n: number }> = { arkevo: { cobrado: 0, pendiente: 0, n: 0 }, otras: { cobrado: 0, pendiente: 0, n: 0 } }
    for (const f of facturas) {
      if (f.fiscal === false) continue                       // registros internos (timesheet), no son facturas declaradas
      if (!f.fecha || new Date(f.fecha + 'T00:00:00').getFullYear() !== anio) continue
      const m = marcaDe(f)
      const fila = (acc[m] = acc[m] || { cobrado: 0, pendiente: 0, n: 0 })
      const total = totalACobrar(f)
      if (f.estado === 'cobrada') fila.cobrado += total; else fila.pendiente += total
      fila.n += 1
    }
    return Object.entries(acc)
  }, [facturas, anio])

  const max = Math.max(1, ...filas.map(([, v]) => v.cobrado + v.pendiente))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Ingresos por marca {demo && <span className="mono" style={{ fontSize: 10, marginLeft: 6, padding: '2px 6px', borderRadius: 4, background: 'var(--amber-dim)', color: 'var(--amber)' }}>DEMO</span>}</div>
          <div className="card-kicker" style={{ marginTop: 2 }}>{anio} · importe a cobrar, con IVA y retención</div>
        </div>
      </div>
      {filas.map(([marca, v]) => {
        const total = v.cobrado + v.pendiente
        return (
          <div key={marca} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 16, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 500, color: total || marca === 'arkevo' ? 'var(--text)' : 'var(--text2)' }}>{NOMBRE[marca] || marca}</div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface3)', overflow: 'hidden', display: 'flex' }}>
              <i style={{ display: 'block', height: '100%', width: `${(v.cobrado / max) * 100}%`, background: 'var(--green)' }} />
              <i style={{ display: 'block', height: '100%', width: `${(v.pendiente / max) * 100}%`, background: 'var(--amber)' }} />
            </div>
            <div className="mono" style={{ textAlign: 'right', fontSize: 13 }}>
              {total ? eur(total) : '—'}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                {total ? `cobrado ${eur(v.cobrado)} · pendiente ${eur(v.pendiente)}` : marca === 'arkevo' ? 'sin facturas todavía' : 'sin facturas'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
