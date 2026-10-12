'use client'

import { useMemo, useState } from 'react'
import { aCobrar, type Hito, type Marca, type ProyectoMarca } from '@/lib/marcas'

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const pill = (txt: string, color: string, dim: string) => (
  <span className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 5, background: dim, color }}>{txt}</span>
)
const ESTADO = { activo: pill('activo', 'var(--blue)', 'var(--blue-dim)'), completado: pill('completado', 'var(--amber)', 'var(--amber-dim)'), facturado: pill('facturado', 'var(--green)', 'var(--green-dim)') }
const PAIS_TXT = { ES: 'España · IVA 21 % − retención 15 %', UE: 'UE · sin IVA', EXT: 'Fuera de la UE · sin IVA' }

function FilaHito({ etiqueta, base, pais, estado, onAccion }: { etiqueta: string; base: number; pais: ProyectoMarca['pais']; estado: Hito; onAccion: () => void }) {
  const total = aCobrar(base, pais)
  const estadoUi = estado === 'cobrada' ? pill('cobrada', 'var(--green)', 'var(--green-dim)') : estado === 'pendiente' ? pill('pendiente', 'var(--amber)', 'var(--amber-dim)') : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13 }}>{etiqueta}<div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>base {eur(base)}</div></div>
      <div className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{eur(total)}</div>
      <div style={{ minWidth: 118, textAlign: 'right' }}>
        {estadoUi || <button className="btn" onClick={onAccion} style={{ fontSize: 12 }}>Facturar</button>}
      </div>
    </div>
  )
}

export default function MarcaTab({ marca, proyectos, demo }: { marca: Marca; proyectos: ProyectoMarca[]; demo: boolean }) {
  const [aviso, setAviso] = useState('')
  const delMarca = proyectos.filter(p => p.marca === marca.key)
  const clientes = useMemo(() => Array.from(new Set(delMarca.map(p => p.cliente))).sort((a, b) => a.localeCompare(b)), [delMarca])
  const tot = useMemo(() => delMarca.reduce((t, p) => {
    for (const h of [p.inicio, p.fin]) {
      const x = aCobrar(p.precio / 2, p.pais)
      if (h === 'cobrada') t.cobrado += x; else if (h === 'pendiente') t.pendiente += x; else t.porFacturar += x
    }
    return t
  }, { cobrado: 0, pendiente: 0, porFacturar: 0 }), [delMarca])

  const accion = () => {
    setAviso(demo ? 'Demo: no se escribe nada. En real, esto crearía la factura con el siguiente número y marca ' + marca.key + '.' : 'Facturar desde aquí se activa tras la migración de la columna marca.')
    setTimeout(() => setAviso(''), 3500)
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[['Proyectos', String(delMarca.length), 'var(--text)'], ['Cobrado', eur(tot.cobrado), 'var(--green)'], ['Pendiente de cobro', eur(tot.pendiente), 'var(--amber)'], ['Por facturar', eur(tot.porFacturar), 'var(--text2)']].map(([l, v, c]) => (
          <div key={l}><div className="card-kicker">{l}</div><div className="mono" style={{ fontSize: 20, marginTop: 6, color: c }}>{v}</div></div>
        ))}
      </div>
      {demo && <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 12 }}>DEMO · datos de ejemplo, no se lee ni se escribe nada en la base de datos.</div>}
      {aviso && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>{aviso}</div>}
      {clientes.length === 0 && <div className="card" style={{ color: 'var(--text3)', fontSize: 13 }}>Todavía no hay clientes en {marca.nombre}.</div>}
      {clientes.map(cli => {
        const ps = delMarca.filter(p => p.cliente === cli)
        return (
          <div className="card" key={cli} style={{ marginBottom: 14 }}>
            <div className="card-head">
              <div><div className="card-title">{cli}</div><div className="card-kicker" style={{ marginTop: 2 }}>{PAIS_TXT[ps[0].pais]}</div></div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text3)' }}>{ps.length} proyecto{ps.length === 1 ? '' : 's'}</div>
            </div>
            {ps.map(p => (
              <div key={p.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{p.nombre}</span>{pill(p.plan, 'var(--accent-bright)', 'var(--accent-dim)')}{ESTADO[p.estado]}
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 13 }}>{eur(p.precio)}</span>
                </div>
                <FilaHito etiqueta="50 % al empezar" base={p.precio / 2} pais={p.pais} estado={p.inicio} onAccion={accion} />
                <FilaHito etiqueta="50 % al publicar" base={p.precio / 2} pais={p.pais} estado={p.fin} onAccion={accion} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
