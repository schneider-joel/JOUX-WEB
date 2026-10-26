import Link from 'next/link'
import { cargarWork, type LeadWork, type ProyectoWork } from '@/lib/work-datos'
import { ETAPAS_VISTA, etapaVista, nombreCorto, type Estado } from '@/lib/seguimiento'
import { ETAPAS_LEAD_VISTA, ETIQUETA_ESTADO, etapaLead, hace } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Proyectos · JOUX Hub' }

// Work › Proyectos (rediseño comercial, fase 1; referencia ../../../../prototipo-crm/work.html): una franja
// por marca con sus leads abiertos a la izquierda y sus proyectos a la derecha. Cada tarjeta enseña lo
// esencial y una sola línea de estado; todo lo demás está en su ficha. /leads redirige aquí.
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)} €`

function Barra({ etapas, actual }: { etapas: readonly string[]; actual: number }) {
  return (
    <span className="wk__etapas" style={{ ['--n' as string]: etapas.length }}>
      <span className="wk__barra" aria-hidden="true">{etapas.map((e, i) => <i key={e} className={i < actual ? 'is-hecho' : i === actual ? 'is-ahora' : ''} />)}</span>
      <span className="wk__etiqueta">{etapas.map((e, i) => <span key={e}>{i === actual ? e : ''}</span>)}</span>
    </span>
  )
}

const Estado = ({ e }: { e: Estado }) => <span className={`wk__estado is-${e.k}`}>{e.texto}</span>

function TarjetaLead({ l }: { l: LeadWork }) {
  return (
    <Link href={`/leads/${l.id}`} className="wk__card is-lead">
      <span className="wk__q"><b>{l.empresa || l.nombre || l.email}</b><span>{l.empresa && l.nombre ? `${l.nombre} · ` : ''}{hace(l.recibido_en)}{l.prueba ? ' · prueba' : ''}</span></span>
      <Barra etapas={ETAPAS_LEAD_VISTA} actual={etapaLead(l)} />
      <Estado e={l.estadoVista} />
    </Link>
  )
}

function TarjetaProyecto({ p, marca }: { p: ProyectoWork; marca: string }) {
  const titulo = nombreCorto(p.nombre, p.cliente, marca)  // la razón social va debajo si es distinta
  const sub = [titulo.toLowerCase() !== p.cliente.toLowerCase() ? p.cliente : null, p.plan, p.precio ? eur(p.precio) : null, p.prueba ? 'prueba' : null].filter(Boolean).join(' · ')
  return (
    <Link href={`/proyectos/${p.id}`} className="wk__card">
      <span className="wk__q"><b>{titulo}</b><span>{sub}</span></span>
      <Barra etapas={ETAPAS_VISTA} actual={etapaVista(p.fase)} />
      <Estado e={p.estadoVista} />
    </Link>
  )
}

export default async function WorkPage({ searchParams }: { searchParams: { marca?: string } }) {
  const { franjas, error } = await cargarWork()
  const filtro = franjas.some(f => f.key === searchParams.marca) ? searchParams.marca : undefined
  const tuyos = (f: (typeof franjas)[number]) => f.leads.filter(l => l.estadoVista.k === 'tu').length + f.proyectos.filter(p => p.estadoVista.k === 'tu').length

  return (
    <main className="main">
      <header className="page-header wk">
        <div className="page-header__txt">
          <h1 className="page-title">Proyectos</h1>
          <p className="tags caps">Leads y proyectos por marca</p>
        </div>
        <p className="wk__leyenda"><span className="wk__estado is-tu">te toca</span><span className="wk__estado is-espera">esperando</span><span className="wk__estado is-parado">parado</span></p>
      </header>

      <nav className="chips__row wk" aria-label="Marca">
        <Link href="/work" className="chip" aria-current={!filtro ? 'page' : undefined}><span>Todas</span></Link>
        {franjas.map(f => (
          <Link key={f.key} href={`/work?marca=${f.key}`} className="chip" aria-current={filtro === f.key ? 'page' : undefined}><span>{f.nombre}{tuyos(f) > 0 && <b>{tuyos(f)}</b>}</span></Link>
        ))}
      </nav>

      {error ? <p className="empty wk">No se pudieron cargar los proyectos.</p> : franjas.filter(f => !filtro || f.key === filtro).map(f => (
        <section key={f.key} className="wk wk__franja" aria-labelledby={`wk-${f.key}`}>
          <header className="wk__cab">
            <h2 id={`wk-${f.key}`}>{f.nombre}</h2>
            <Link href={`/work/${f.key}`} className="copy caps">Pagos y clientes →</Link>
          </header>
          <div className="wk__carriles">
            <div className="wk__carril">
              <p className="caps wk__titulo"><span>Leads</span><span>{f.leads.length}</span></p>
              {f.leads.length ? f.leads.map(l => <TarjetaLead key={l.id} l={l} />) : <p className="wk__vacio">Ningún lead abierto</p>}
            </div>
            <div className="wk__carril">
              <p className="caps wk__titulo"><span>Proyectos</span><span>{f.proyectos.length}</span></p>
              {f.proyectos.length ? <div className="wk__rejilla">{f.proyectos.map(p => <TarjetaProyecto key={p.id} p={p} marca={f.nombre} />)}</div> : <p className="wk__vacio">Ningún proyecto en marcha</p>}
            </div>
          </div>
          {(f.cerrados.length > 0 || f.perdidos.length > 0) && (
            <details className="wk__cerrados">
              <summary className="copy caps">{[f.cerrados.length && `${f.cerrados.length} cerrado${f.cerrados.length === 1 ? '' : 's'}`, f.perdidos.length && `${f.perdidos.length} perdido${f.perdidos.length === 1 ? '' : 's'} o spam`].filter(Boolean).join(' · ')}</summary>
              <ul className="mk__filas">
                {f.cerrados.map(p => <li key={`p${p.id}`}><Link href={`/proyectos/${p.id}`}><span>{nombreCorto(p.nombre, p.cliente, f.nombre)} <span className="dim">· {p.cliente}</span></span><span className="fx__tag ok">Cerrado</span></Link></li>)}
                {f.perdidos.map(l => <li key={`l${l.id}`}><Link href={`/leads/${l.id}`}><span>{l.empresa || l.nombre || l.email} <span className="dim">· {hace(l.recibido_en)}</span></span><span className="fx__tag">{ETIQUETA_ESTADO[l.estado]}</span></Link></li>)}
              </ul>
            </details>
          )}
        </section>
      ))}
    </main>
  )
}
