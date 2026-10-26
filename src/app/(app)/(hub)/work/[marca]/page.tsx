import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { MARCAS_TREATMENT } from '@/lib/seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

export async function generateMetadata({ params }: { params: { marca: string } }) {
  const { data } = await sb.from('marcas').select('nombre').eq('key', params.marca).maybeSingle()
  return { title: `${data?.nombre || 'Marca'} · JOUX Hub` }
}

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))} €`
const ABIERTOS = ['nuevo', 'borrador', 'respondido', 'conversacion', 'propuesta']

// Página de una marca (rediseño comercial, fase 4): solo dinero y clientes. Los proyectos y sus etapas viven
// en Work › Proyectos (/work?marca=); aquí, cuatro cifras y, debajo, la pestaña de siempre que pinta el hub
// (pagos y clientes, o timesheets), donde se factura. Solo lee.
export default async function MarcaPage({ params }: { params: { marca: string } }) {
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo, dominio').eq('key', params.marca).maybeSingle()
  if (!marca) notFound()
  const seguida = marca.modo === 'cerrado' || MARCAS_TREATMENT.includes(marca.key)
  const conLeads = marca.key !== 'ab'
  const anio = new Date().getFullYear()

  const [{ data: proyectos }, { data: facturas }, { count: leadsAbiertos }] = await Promise.all([
    sb.from('proyectos').select('id, status, fase').eq('marca', marca.key),
    sb.from('facturas').select('id, importe, estado, fecha, marca, proyecto_id, fiscal').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`),
    conLeads ? sb.from('leads').select('id', { count: 'exact', head: true }).eq('marca', marca.key).in('estado', ABIERTOS) : Promise.resolve({ count: 0 }),
  ])

  // Facturas del año de la marca: las suyas o, si no llevan marca (las del trigger del timesheet), las de sus proyectos.
  const ids = new Set((proyectos || []).map(p => p.id))
  const deMarca = (facturas || []).filter(f => f.fiscal !== false && (f.marca === marca.key || (!f.marca && f.proyecto_id != null && ids.has(f.proyecto_id))))
  const cobrado = deMarca.filter(f => f.estado === 'cobrada').reduce((t, f) => t + Number(f.importe), 0)
  const pendiente = deMarca.filter(f => f.estado === 'pendiente')
  // En marcha: con etapa y sin cerrar (lo mismo que enseña Work); sin seguimiento, los activos del timesheet.
  const enMarcha = seguida ? (proyectos || []).filter(p => p.fase && p.fase !== 'cerrado').length : (proyectos || []).filter(p => p.status === 'activo').length
  const enWork = `/work?marca=${marca.key}`

  return (
    <div className="mk">
      <section className="fx__kpis" aria-label={`Resumen de ${marca.nombre}`}>
        <div className="fx__kpi">
          <span className="fx__l">Cobrado en {anio}</span>
          <span className="fx__v">{eur(cobrado)}</span>
          <span className="fx__s">Base sin IVA</span>
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Por cobrar</span>
          <span className="fx__v">{eur(pendiente.reduce((t, f) => t + Number(f.importe), 0))}</span>
          <span className="fx__s">{pendiente.length ? `${pendiente.length} factura${pendiente.length === 1 ? '' : 's'} pendiente${pendiente.length === 1 ? '' : 's'}` : 'Todo cobrado'}</span>
        </div>
        {seguida ? (
          <Link href={enWork} className="fx__kpi">
            <span className="fx__l">En marcha</span>
            <span className="fx__v">{enMarcha}</span>
            <span className="fx__s">Ver en Proyectos →</span>
          </Link>
        ) : (
          <div className="fx__kpi">
            <span className="fx__l">Activos</span>
            <span className="fx__v">{enMarcha}</span>
            <span className="fx__s">en el timesheet</span>
          </div>
        )}
        {conLeads ? (
          <Link href={enWork} className="fx__kpi">
            <span className="fx__l">Leads abiertos</span>
            <span className="fx__v">{leadsAbiertos || 0}</span>
            <span className="fx__s">Ver en Proyectos →</span>
          </Link>
        ) : (
          <div className="fx__kpi">
            <span className="fx__l">Proyectos</span>
            <span className="fx__v">{(proyectos || []).length}</span>
            <span className="fx__s">en total</span>
          </div>
        )}
      </section>

      <h2 className="mk__pagos" id="pagos">{marca.modo === 'cerrado' ? 'Pagos y clientes' : 'Timesheets y facturas'}</h2>
    </div>
  )
}
