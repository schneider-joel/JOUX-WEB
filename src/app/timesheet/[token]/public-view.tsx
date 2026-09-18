'use client'

import { useState } from 'react'

type Proyecto = {
  id: number
  nombre: string
  cliente: string
  status: string
  numero_proyecto?: string
}

type Dia = {
  id: number
  proyecto_id: number
  fecha: string
  rate: number
  hrs: number | null
  standby_hrs: number
  total_day: number
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

const statusLabel: Record<string, string> = { activo: 'Active', completado: 'Completed', facturado: 'Invoiced' }
const statusColor: Record<string, string> = { activo: '#92400e', completado: '#374151', facturado: '#166534' }
const statusBg: Record<string, string> = { activo: '#fef3c7', completado: '#f3f4f6', facturado: '#dcfce7' }

export default function PublicTimesheetView({
  proyectos,
  dias,
  facturas,
}: {
  proyectos: Proyecto[]
  dias: Dia[]
  facturas: { id: number; proyecto_id: number }[]
}) {
  const [query, setQuery] = useState('')
  const [cliente, setCliente] = useState('todos')

  const diasDe = (proyectoId: number) => dias.filter(d => d.proyecto_id === proyectoId).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const totalProyecto = (proyectoId: number) => diasDe(proyectoId).reduce((s, d) => s + Number(d.total_day), 0)
  const facturaDe = (proyectoId: number) => facturas.find(f => f.proyecto_id === proyectoId)
  const ultimaFecha = (proyectoId: number) => {
    const ds = diasDe(proyectoId)
    return ds.length ? ds[ds.length - 1].fecha : ''
  }

  const q = query.trim().toLowerCase()
  const filtrados = proyectos
    .filter(p => cliente === 'todos' || p.cliente === cliente)
    .filter(p => !q || p.nombre.toLowerCase().includes(q) || (p.numero_proyecto || '').toLowerCase().includes(q))
    .sort((a, b) => ultimaFecha(b.id).localeCompare(ultimaFecha(a.id)))

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', fontFamily: 'Inter, sans-serif', color: '#111', padding: '48px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Timesheet</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Joel Schneider · Ambushed / BoldMove</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none', background: '#fff' }}
          />
          <select
            value={cliente}
            onChange={e => setCliente(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none', background: '#fff' }}
          >
            <option value="todos">All clients</option>
            <option value="Ambushed">Ambushed</option>
            <option value="BoldMove">BoldMove</option>
          </select>
        </div>

        {filtrados.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: 14, padding: '60px 0' }}>
            {proyectos.length === 0 ? 'No projects yet.' : 'No projects match your search.'}
          </div>
        )}

        {filtrados.map(p => {
          const factura = facturaDe(p.id)
          return (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 24, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {p.cliente}{p.numero_proyecto ? ` · #${p.numero_proyecto}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: statusBg[p.status], color: statusColor[p.status] }}>
                    {statusLabel[p.status] || p.status}
                  </span>
                  {p.status === 'facturado' && factura && (
                    <a href={`/invoice/${factura.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                      Invoice ↓
                    </a>
                  )}
                  <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600 }}>€{fmt(totalProyecto(p.id))}</div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5', color: '#888' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>Hrs</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>Rate</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>Stand by</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {diasDe(p.id).map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 0' }}>{fmtDate(d.fecha)}</td>
                      <td style={{ padding: '8px 0' }}>{d.hrs ?? '—'}</td>
                      <td style={{ padding: '8px 0' }}>€{d.rate}</td>
                      <td style={{ padding: '8px 0' }}>{d.standby_hrs > 0 ? `${d.standby_hrs}h` : '—'}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace' }}>€{fmt(d.total_day)}</td>
                    </tr>
                  ))}
                  {diasDe(p.id).length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '12px 0', color: '#888' }}>No days logged yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
