import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ESTADOS_LEAD, ETIQUETA_ESTADO, hace, type FaseProyecto, type Lead } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Pipeline · JOUX Hub' }

// Pipeline: los leads de todas las marcas en columnas por estado, con filtro por marca (?marca=).
// Los proyectos se siguen en /proyectos; aquí solo el enlace con cuántos hay.
type Fila = Pick<Lead, 'id' | 'marca' | 'estado' | 'nombre' | 'email' | 'empresa' | 'recibido_en'>
type FilaProyecto = { id: number; nombre: string; cliente: string; marca: string | null; fase: FaseProyecto; lead_id: number | null }

export default async function PipelinePage({ searchParams }: { searchParams: { marca?: string } }) {
  const [{ data: leads, error }, { data: marcas }, { data: proyectos }] = await Promise.all([
    sb.from('leads').select('id, marca, estado, nombre, email, empresa, recibido_en').order('recibido_en', { ascending: false }).limit(500),
    sb.from('marcas').select('key, nombre, orden').order('orden'),
    sb.from('proyectos').select('id, nombre, cliente, marca, fase, lead_id').not('fase', 'is', null).not('precio_cerrado', 'is', null).order('created_at', { ascending: false }),
  ])
  // Ambushed / BoldMove no tiene leads por estos sistemas.
  const conLeads = (marcas || []).filter(m => m.key !== 'ab')
  const filtro = conLeads.some(m => m.key === searchParams.marca) ? searchParams.marca : undefined
  const lista = ((leads || []) as Fila[]).filter(l => !filtro || l.marca === filtro)
  const listaP = ((proyectos || []) as FilaProyecto[]).filter(p => !filtro || p.marca === filtro)
  const nombreMarca = new Map((marcas || []).map(m => [m.key, m.nombre as string]))

  return (
    <div className="app">
      <header className="frame frame--top caps">
        <Link href="/" className="mark" style={{ textDecoration: 'none' }}>JOUX HUB</Link>
        <Link href="/" className="copy">← Overview</Link>
      </header>
      <main className="main">
        <header className="page-header pipe__head">
          <div className="page-header__txt">
            <h1 className="page-title">Pipeline</h1>
            <p className="tags caps">Leads de todas las marcas, por estado</p>
          </div>
        </header>

        <nav className="chips__row pipe__head" aria-label="Marca" style={{ marginBottom: 48 }}>
          <Link href="/pipeline" className="chip" aria-current={!filtro ? 'page' : undefined}><span>Todas</span></Link>
          {conLeads.map(m => (
            <Link key={m.key} href={`/pipeline?marca=${m.key}`} className="chip" aria-current={filtro === m.key ? 'page' : undefined}><span>{m.nombre}</span></Link>
          ))}
        </nav>

        {error ? <p className="empty pipe__head">No se pudieron cargar los leads.</p> : (
          <div className="pipe">
            {ESTADOS_LEAD.map(estado => {
              const col = lista.filter(l => l.estado === estado)
              return (
                <section key={estado} className="block pipe__col" aria-label={ETIQUETA_ESTADO[estado]}>
                  <p className="label caps"><span>{ETIQUETA_ESTADO[estado]}</span><i className="rule" /><span className="label__m">{col.length}</span></p>
                  {col.length === 0 ? <p className="nota">—</p> : (
                    <ul className="list focus">
                      {col.map(l => (
                        <li key={l.id}>
                          <Link href={`/leads/${l.id}`} className="fila pipe__lead">
                            <span className="fila__main">
                              <span className="fila__t">{l.nombre || l.email}{l.empresa ? <span> · {l.empresa}</span> : null}</span>
                              <span className="fila__s caps">{filtro ? '' : `${nombreMarca.get(l.marca) || l.marca} · `}{hace(l.recibido_en)}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <Link href="/proyectos" className="fila pipe__lead pipe__head" style={{ marginTop: 64, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
          <span className="fila__main">
            <span className="fila__t">Proyectos</span>
            <span className="fila__s caps">Webs · seguimiento por etapa · {listaP.length}</span>
          </span>
          <span className="copy caps">Abrir →</span>
        </Link>
      </main>
    </div>
  )
}
