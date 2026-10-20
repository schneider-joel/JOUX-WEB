import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ESTADOS_LEAD, ETIQUETA_ESTADO, hace, type FaseProyecto, type Lead } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Leads · JOUX Hub' }

// Leads (antes /pipeline): los de todas las marcas en columnas por estado, con filtro por marca (?marca=).
// Los proyectos se siguen en Work › Proyectos (/work); aquí solo el enlace con cuántos hay.
// Columnas del tablero: los abiertos (ganados, perdidos y spam van en una lista aparte) y los estados que esperan a Joel.
const CERRADOS: string[] = ['ganado', 'perdido', 'spam']
const COLUMNAS = ESTADOS_LEAD.filter(e => !CERRADOS.includes(e))
const ESPERAN: string[] = ['nuevo', 'borrador', 'conversacion']
const QUE_TOCA: Record<string, string> = { nuevo: 'Sin responder', borrador: 'Borrador listo', conversacion: 'Ha respondido' }
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
    <main className="main">
        <header className="page-header pipe__head">
          <div className="page-header__txt">
            <h1 className="page-title">Leads</h1>
            <p className="tags caps">Leads de todas las marcas, por estado</p>
          </div>
        </header>

        <nav className="chips__row pipe__head" aria-label="Marca" style={{ marginBottom: 48 }}>
          <Link href="/leads" className="chip" aria-current={!filtro ? 'page' : undefined}><span>Todas</span></Link>
          {conLeads.map(m => (
            <Link key={m.key} href={`/leads?marca=${m.key}`} className="chip" aria-current={filtro === m.key ? 'page' : undefined}><span>{m.nombre}</span></Link>
          ))}
        </nav>

        {error ? <p className="empty pipe__head">No se pudieron cargar los leads.</p> : (
          <>
          {/* Tablero por estado (el mismo de la página de cada marca). Los que esperan a Joel, en ámbar. */}
          {!lista.some(l => (COLUMNAS as readonly string[]).includes(l.estado)) ? <p className="empty pipe__head">No hay leads abiertos{filtro ? ` en ${nombreMarca.get(filtro) || filtro}` : ''}.</p> : <div className="mk__scroll pipe__head">
            <div className="mk__kanban" style={{ ['--n' as string]: COLUMNAS.length }}>
              {COLUMNAS.map(estado => {
                const col = lista.filter(l => l.estado === estado)
                return (
                  <div key={estado} className="mk__col">
                    <h3>{ETIQUETA_ESTADO[estado]}<span>{col.length}</span></h3>
                    {col.length === 0 ? <div className="mk__vacio">Ninguno</div> : col.map(l => (
                      <Link key={l.id} href={`/leads/${l.id}`} className={`mk__card${ESPERAN.includes(estado) ? ' is-toca' : ''}`}>
                        <b>{l.empresa || l.nombre || l.email}</b>
                        <span className="mk__m"><span>{filtro ? (l.empresa ? l.nombre || l.email : '') : nombreMarca.get(l.marca) || l.marca}</span><span>{hace(l.recibido_en)}</span></span>
                        {ESPERAN.includes(estado) && <span className="mk__toca">{QUE_TOCA[estado]}</span>}
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>}
          {lista.some(l => CERRADOS.includes(l.estado)) && (
            <section className="fx__card pipe__head" style={{ marginTop: 40 }} aria-labelledby="ld-fuera">
              <header><h2 id="ld-fuera">Ganados, perdidos y spam</h2><span className="caps dim">{lista.filter(l => CERRADOS.includes(l.estado)).length}</span></header>
              <ul className="mk__filas">
                {lista.filter(l => CERRADOS.includes(l.estado)).slice(0, 30).map(l => (
                  <li key={l.id}><Link href={`/leads/${l.id}`}><span>{l.empresa || l.nombre || l.email} <span className="dim">· {filtro ? '' : `${nombreMarca.get(l.marca) || l.marca} · `}{hace(l.recibido_en)}</span></span><span className={`fx__tag${l.estado === 'ganado' ? ' ok' : ''}`}>{ETIQUETA_ESTADO[l.estado]}</span></Link></li>
                ))}
              </ul>
            </section>
          )}
          </>
        )}

        <Link href="/work" className="fila pipe__lead pipe__head" style={{ marginTop: 64, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
          <span className="fila__main">
            <span className="fila__t">Proyectos</span>
            <span className="fila__s caps">Webs · seguimiento por etapa · {listaP.length}</span>
          </span>
          <span className="copy caps">Abrir →</span>
        </Link>
    </main>
  )
}
