import Link from 'next/link'
import { cargarSeguimiento } from '@/lib/seguimiento-datos'
import Seguimiento from './seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Proyectos · JOUX Hub' }
// Work › Proyectos (antes /proyectos, que redirige aquí).

// Seguimiento visual de cada proyecto por fase (proyectos.fase): las webs (modo «cerrado»: Arkevo, Custom
// Websites…), con las activas y las que ya tienen fase, y los treatments de The Pitch Lab que tienen fase
// (los nuevos desde «Marcar ganado»; los antiguos siguen solo en su timesheet). La fase se cambia aquí a
// mano y queda en eventos (proyecto.fase); «Comenzado» crea el encargo del agente.
export default async function ProyectosPage() {
  const { marcas, lista, error } = await cargarSeguimiento()

  return (
    <main className="main">
        <header className="page-header trk__ancho">
          <div className="page-header__txt">
            <h1 className="page-title">Proyectos</h1>
            <p className="tags caps">Webs y treatments · seguimiento por etapa</p>
          </div>
          <Link href="/leads" className="copy caps">Leads →</Link>
        </header>
        {error ? <p className="empty trk__ancho">No se pudieron cargar los proyectos.</p>
          : <Seguimiento proyectos={lista} marcas={marcas.map(m => ({ key: m.key as string, nombre: m.nombre as string }))} />}
    </main>
  )
}
