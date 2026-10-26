import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { cargarSeguimiento } from '@/lib/seguimiento-datos'
import { diasDesde, estaParado, fasesDe, MARCAS_TREATMENT, queToca } from '@/lib/seguimiento'
import { ETIQUETA_FASE, hace } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

export async function generateMetadata({ params }: { params: { marca: string } }) {
  const { data } = await sb.from('marcas').select('nombre').eq('key', params.marca).maybeSingle()
  return { title: `${data?.nombre || 'Marca'} · JOUX Hub` }
}

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))} €`
const ESPERAN = ['nuevo', 'borrador', 'conversacion']

// Página de una marca (rediseño, fase 3): cifras, tablero de proyectos por etapa y terminados/perdidos.
// Debajo, el hub pinta su pestaña de siempre (pagos y facturas, o timesheets), que no cambia. Solo lee.
export default async function MarcaPage({ params }: { params: { marca: string } }) {
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo, dominio').eq('key', params.marca).maybeSingle()
  if (!marca) notFound()
  const seguida = marca.modo === 'cerrado' || MARCAS_TREATMENT.includes(marca.key)
  const conLeads = marca.key !== 'ab'
  const anio = new Date().getFullYear()

  const [seg, { data: proyectos }, { data: facturas }, { data: leads }, { data: perdidos }] = await Promise.all([
    seguida ? cargarSeguimiento() : Promise.resolve(null),
    sb.from('proyectos').select('id, precio_cerrado, status').eq('marca', marca.key),
    sb.from('facturas').select('id, importe, estado, fecha, marca, proyecto_id, pago, fiscal').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`),
    conLeads ? sb.from('leads').select('id, nombre, email, empresa, estado, recibido_en').eq('marca', marca.key).order('recibido_en', { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    conLeads ? sb.from('eventos').select('lead_id, datos, created_at').eq('tipo', 'lead.perdido').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ])

  // Facturas del año de la marca: las suyas o, si no llevan marca (las del trigger del timesheet), las de sus proyectos.
  const ids = new Set((proyectos || []).map(p => p.id))
  const deMarca = (facturas || []).filter(f => f.fiscal !== false && (f.marca === marca.key || (!f.marca && f.proyecto_id != null && ids.has(f.proyecto_id))))
  const cobrado = deMarca.filter(f => f.estado === 'cobrada').reduce((t, f) => t + Number(f.importe), 0)
  const pendiente = deMarca.filter(f => f.estado === 'pendiente')
  const lista = (seg?.lista || []).filter(p => p.marca === marca.key)
  const enMarcha = lista.filter(p => p.fase !== 'cerrado')
  // Tablero solo si hay algo que seguir por etapas (los treatments antiguos no tienen etapa: van en su timesheet).
  const conTablero = seguida && lista.some(p => p.fase)
  const activos = (proyectos || []).filter(p => p.status === 'activo').length
  const esperan = enMarcha.filter(p => queToca(p, estaParado(p)))
  const leadsEsperan = (leads || []).filter(l => ESPERAN.includes(l.estado))
  // Cobrado de cada web (pagos 1 y 2), para la barrita de la tarjeta. Todas sus facturas, no solo las del año.
  const { data: pagos } = seguida && marca.modo === 'cerrado' && ids.size
    ? await sb.from('facturas').select('proyecto_id, importe, estado').in('proyecto_id', Array.from(ids)).not('pago', 'is', null)
    : { data: [] }
  const precio = new Map((proyectos || []).map(p => [p.id, Number(p.precio_cerrado || 0)]))
  const cobradoDe = (id: number) => (pagos || []).filter(f => f.proyecto_id === id && f.estado === 'cobrada').reduce((t, f) => t + Number(f.importe), 0)

  const fases = fasesDe(marca.key).filter(f => f !== 'cerrado')
  const cerrados = lista.filter(p => p.fase === 'cerrado')
  const motivo = new Map((perdidos || []).map(e => [e.lead_id, (e.datos as { motivo?: string })?.motivo || '']))
  const perdidosMarca = (leads || []).filter(l => l.estado === 'perdido').slice(0, 8)

  return (
    <div className="mk">
      <section className="fx__kpis" aria-label={`Resumen de ${marca.nombre}`}>
        <div className="fx__kpi">
          <span className="fx__l">En marcha</span>
          <span className="fx__v">{conTablero ? enMarcha.length : activos}</span>
          <span className={`fx__s${esperan.length ? ' aviso' : ''}`}>{conTablero ? (esperan.length ? `${esperan.length} te ${esperan.length === 1 ? 'espera' : 'esperan'}` : 'Nada pendiente') : `activos en el timesheet · ${(proyectos || []).length} en total`}</span>
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Leads</span>
          <span className="fx__v">{conLeads ? leadsEsperan.length : '—'}</span>
          <span className="fx__s">{conLeads ? `por atender · ${(leads || []).length} en total` : 'Sin leads por las webs'}</span>
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Cobrado en {anio}</span>
          <span className="fx__v">{eur(cobrado)}</span>
          <span className="fx__s">Base sin IVA</span>
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Por cobrar</span>
          <span className="fx__v">{eur(pendiente.reduce((t, f) => t + Number(f.importe), 0))}</span>
          <span className={`fx__s${pendiente.length ? ' aviso' : ''}`}>{pendiente.length ? `${pendiente.length} factura${pendiente.length === 1 ? '' : 's'} pendiente${pendiente.length === 1 ? '' : 's'}` : 'Todo cobrado'}</span>
        </div>
      </section>

      <nav className="mk__tabs" aria-label={`Secciones de ${marca.nombre}`}>
        {conTablero && <a href="#tablero" aria-current="page">Proyectos<span>{enMarcha.length}</span></a>}
        <a href="#pagos">{marca.modo === 'cerrado' ? 'Pagos y clientes' : 'Timesheets'}</a>
        {conLeads && <Link href={`/work?marca=${marca.key}`}>Leads<span>{(leads || []).length}</span></Link>}
      </nav>

      {conTablero && (
        <section id="tablero" aria-label="Proyectos por etapa">
          <div className="mk__scroll">
            <div className="mk__kanban" style={{ ['--n' as string]: fases.length }}>
              {fases.map(f => {
                const col = enMarcha.filter(p => p.fase === f)
                return (
                  <div key={f} className="mk__col">
                    <h3>{ETIQUETA_FASE[f]}<span>{col.length}</span></h3>
                    {col.length === 0 ? <div className="mk__vacio">Ninguno</div> : col.map(p => {
                      const toca = queToca(p, estaParado(p))
                      const pr = precio.get(p.id) || 0
                      return (
                        <Link key={p.id} href={`/proyectos/${p.id}`} className={`mk__card${toca ? ' is-toca' : ''}`}>
                          <b>{p.cliente}</b>
                          <span className="mk__m"><span>{p.plan || p.nombre}</span><span>{diasDesde(p.desde) === 0 ? 'hoy' : `${diasDesde(p.desde)} d`}</span></span>
                          {marca.modo === 'cerrado' && pr > 0 && <span className="fx__meter"><i style={{ width: `${Math.min(100, cobradoDe(p.id) / pr * 100)}%` }} /></span>}
                          {toca && <span className="mk__toca">{toca}</span>}
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          {lista.some(p => !p.fase) && <p className="nota">{lista.filter(p => !p.fase).length} sin etapa: ábrelos desde <Link href="/work">Work › Proyectos</Link>.</p>}
        </section>
      )}

      {(cerrados.length > 0 || perdidosMarca.length > 0) && (
        <section className="fx__card" aria-labelledby="mk-term">
          <header><h2 id="mk-term">Terminados y perdidos</h2><span className="caps dim">{cerrados.length + perdidosMarca.length}</span></header>
          <ul className="mk__filas">
            {cerrados.map(p => (
              <li key={`p${p.id}`}><Link href={`/proyectos/${p.id}`}><span>{p.cliente} <span className="dim">· {p.nombre} · cerrado {hace(p.desde)}</span></span><span className="fx__tag ok">Terminado</span></Link></li>
            ))}
            {perdidosMarca.map(l => (
              <li key={`l${l.id}`}><Link href={`/leads/${l.id}`}><span>{l.empresa || l.nombre || l.email} <span className="dim">· perdido{motivo.get(l.id) ? `: ${motivo.get(l.id)}` : ''}</span></span><span className="fx__tag">Perdido</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mk__pagos" id="pagos">{marca.modo === 'cerrado' ? 'Pagos y clientes' : 'Timesheets y facturas'}</h2>
    </div>
  )
}
