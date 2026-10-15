'use client'

import { useState } from 'react'
import { desglose } from '@/lib/importes'

type Proyecto = {
  id: number
  nombre: string
  cliente: string
  status: string
  numero_proyecto?: string
  modo_rate?: string
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

export default function PublicTimesheetView({
  titulo,
  clientes,
  proyectos,
  dias,
  facturas,
  clientesEspana = [],
}: {
  titulo: string
  clientes: string[]
  proyectos: Proyecto[]
  dias: Dia[]
  facturas: { id: number; proyecto_id: number }[]
  clientesEspana?: string[]
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

  // Con el aspecto del hub (.app), sin su marco: el cliente solo ve su timesheet. Mismo filtro, mismas cuentas.
  return (
    <div className="app">
      <main className="publica">
        <header className="page-header">
          <div className="page-header__txt">
            <h1 className="page-title">Timesheet</h1>
            <p className="tags caps">Joel Schneider · {titulo}</p>
          </div>
        </header>

        <div className="col">
          <div className="tools">
            {clientes.length > 1 && (
              <fieldset className="chips">
                <legend className="sr">Client</legend>
                <div className="chips__row">
                  {[['todos', 'All clients'], ...clientes.map(c => [c, c])].map(([valor, texto]) => (
                    <label key={valor} className="chip">
                      <input type="radio" name="cliente" value={valor} checked={cliente === valor} onChange={e => setCliente(e.target.value)} />
                      <span>{texto}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="field tools__q">
              <label className="sr" htmlFor="ts-q">Search</label>
              <input id="ts-q" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects..." />
            </div>
          </div>

          <section className="block" aria-label="Projects">
            <p className="label caps"><span>Projects</span><i className="rule" /><span className="label__m">{filtrados.length}</span></p>
            {filtrados.length === 0 ? (
              <p className="empty">{proyectos.length === 0 ? 'No projects yet.' : 'No projects match your search.'}</p>
            ) : (
              <ul className="projs focus">
                {filtrados.map((p, i) => {
                  const factura = facturaDe(p.id)
                  // Clientes de España: IVA 21 % y retención IRPF 15 % sobre el subtotal.
                  const imp = desglose(totalProyecto(p.id), clientesEspana.includes(p.cliente))
                  return <FilaProyecto key={p.id} p={p} ds={diasDe(p.id)} total={totalProyecto(p.id)} imp={imp} factura={factura} abiertaAlEmpezar={i === 0} />
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

const ESTADO: Record<string, string> = { activo: 'dot--green', completado: 'dot--wait', facturado: 'dot--off' }
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const Bajar = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v8.5M4.5 8 8 11.5 11.5 8M3.5 13.5h9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>

// Un proyecto: nombre, cliente y referencia, total y estado; al desplegar, sus días, el total y la factura
function FilaProyecto({ p, ds, total, imp, factura, abiertaAlEmpezar }: {
  p: Proyecto; ds: Dia[]; total: number; imp: ReturnType<typeof desglose>; factura?: { id: number; proyecto_id: number }; abiertaAlEmpezar: boolean
}) {
  const [abierta, setAbierta] = useState(abiertaAlEmpezar)
  const porHora = p.modo_rate === 'hora'
  const estado = statusLabel[p.status] || p.status
  const hrs = ds.reduce((t, d) => t + Number(d.hrs || 0), 0)
  const sb = ds.reduce((t, d) => t + Number(d.standby_hrs || 0), 0)
  const h = (n: number) => `${Number(n.toFixed(2))}h`
  return (
    <li className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="p__main">
          <span className="p__n">{p.nombre}</span>
          <span className="p__s caps">{p.cliente}{p.numero_proyecto ? ` · #${p.numero_proyecto}` : ''}{imp ? ' · incl. IVA − IRPF' : ''}</span>
        </span>
        <span className="p__v num">€{fmt(imp ? imp.total : total)}</span>
        <span className="st caps"><i className={`dot ${ESTADO[p.status] || 'dot--off'}`} aria-hidden="true" />{estado}</span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          <ul className="dias dias--pub">
            {ds.length === 0 && <li className="dias__vacio">No days logged yet.</li>}
            {ds.map(d => (
              <li key={d.id} className="d">
                <span className="d__fila">
                  <span className="d__f caps">{fmtDate(d.fecha)}</span>
                  <span className="d__q">{porHora ? `${d.hrs ?? '—'}h × €${d.rate}${d.standby_hrs > 0 ? ` · SB ${d.standby_hrs}h` : ''}` : `Day rate €${d.rate}`}</span>
                  <span className="num">€{fmt(d.total_day)}</span>
                  <span />
                </span>
              </li>
            ))}
            {(ds.length > 1 || imp) && (
              <li className="d d--tot">
                <span className="d__fila">
                  <span className="d__f caps">{imp ? 'Subtotal' : 'Total'}</span>
                  <span className="d__q">{porHora ? `${h(hrs)}${sb > 0 ? ` · SB ${h(sb)}` : ''}` : `${ds.length} day${ds.length === 1 ? '' : 's'}`}</span>
                  <span className="num">€{fmt(total)}</span>
                  <span />
                </span>
              </li>
            )}
          </ul>
          {imp && (
            <dl className="tax tax--pub">
              <div><dt>IVA 21%</dt><dd className="num">+€{fmt(imp.iva)}</dd></div>
              <div><dt>IRPF −15%</dt><dd className="num">−€{fmt(imp.ret)}</dd></div>
              <div><dt>Total</dt><dd className="num">€{fmt(imp.total)}</dd></div>
            </dl>
          )}
          {p.status === 'facturado' && factura && (
            <div className="p__foot">
              <a className="ghost" href={`/invoice/${factura.id}${/^(ambushed|boldmove)/i.test(p.cliente) ? '?ref=1' : ''}`} target="_blank" rel="noopener noreferrer"><Bajar />Invoice</a>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
