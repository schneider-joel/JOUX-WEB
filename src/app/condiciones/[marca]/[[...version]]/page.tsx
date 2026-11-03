import { supabaseServer as sb } from '@/lib/supabase-server'
import { condicionesVersion, condicionesVigentes } from '@/lib/presupuestos'
import TextoCondiciones from '../../texto'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Condiciones del servicio', robots: { index: false, follow: false } }

// Condiciones públicas de una marca: /condiciones/<marca> (la vigente) o /condiciones/<marca>/<versión>.
// ?lang=en elige el inglés si existe esa versión en inglés.
export default async function CondicionesPage({ params, searchParams }: { params: { marca: string; version?: string[] }; searchParams: { lang?: string } }) {
  const idioma = searchParams.lang === 'en' ? 'en' : 'es'
  const v = params.version?.[0]
  const c = !/^[a-z]+$/.test(params.marca) ? null
    : v ? (/^\d{1,4}$/.test(v) ? await condicionesVersion(params.marca, Number(v), idioma) : null)
    : await condicionesVigentes(params.marca, idioma)
  if (!c) return <div className="app"><main className="publica publica--vacia"><p className="empty">No encontrado · Not found</p></main></div>
  const { data: marca } = await sb.from('marcas').select('nombre').eq('key', c.marca).maybeSingle()
  const fecha = new Date(c.created_at).toLocaleDateString(c.idioma === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
  return (
    <div className="app">
      <main className="publica">
        <div className="col">
          <header className="page-header">
            <div className="page-header__txt">
              <p className="tags caps">{marca?.nombre || c.marca} · v{c.version} · {fecha}</p>
              <h1 className="page-title">{c.titulo}</h1>
            </div>
          </header>
          <TextoCondiciones texto={c.texto} />
        </div>
      </main>
    </div>
  )
}
