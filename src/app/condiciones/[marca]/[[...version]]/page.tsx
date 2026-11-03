import { readFile } from 'fs/promises'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DOMINIO_PRESUPUESTO, marcaDeHost } from '@/lib/dominios-presupuesto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { condicionesVersion, condicionesVigentes, enlaceCondiciones, type Condiciones } from '@/lib/presupuestos'
import TextoCondiciones from '../../texto'
import { Marco } from '../../../aceptar/marca'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Condiciones del servicio', robots: { index: false, follow: false } }

// Condiciones públicas de una marca: /condiciones/<marca> (la vigente) o /condiciones/<marca>/<versión>.
// ?lang=en elige el inglés si existe esa versión en inglés. ?borrador=1 (solo en local) enseña condiciones/<marca>-v1.md
// tal cual, para ver una versión antes de insertarla.
export default async function CondicionesPage({ params, searchParams }: { params: { marca: string; version?: string[] }; searchParams: { lang?: string; borrador?: string } }) {
  const idioma = searchParams.lang === 'en' ? 'en' : 'es'
  // Las de una marca con subdominio se leen allí (presupuesto.<dominio>/condiciones); el middleware ya reescribe
  // esa ruta a esta página con la marca del host, así que aquí solo se redirige desde Joux Hub.
  const enSubdominio = !!marcaDeHost(headers().get('host'))
  if (!enSubdominio && DOMINIO_PRESUPUESTO[params.marca] && !searchParams.borrador && process.env.NODE_ENV === 'production') {
    const v = Number(params.version?.[0])
    redirect(v > 0 ? enlaceCondiciones(params.marca, v, idioma) : `https://${DOMINIO_PRESUPUESTO[params.marca]}/condiciones${idioma === 'en' ? '?lang=en' : ''}`)
  }
  const v = params.version?.[0]
  const c = !/^[a-z]+$/.test(params.marca) ? null
    : searchParams.borrador && process.env.NODE_ENV !== 'production' ? await borrador(params.marca, idioma)
    : v ? (/^\d{1,4}$/.test(v) ? await condicionesVersion(params.marca, Number(v), idioma) : null)
    : await condicionesVigentes(params.marca, idioma)
  if (!c) return <Marco marca="otra" nombre=""><h1>No encontrado</h1><p className="pz__nota">Not found.</p></Marco>
  const { data: marca } = await sb.from('marcas').select('nombre').eq('key', c.marca).maybeSingle()
  const fecha = new Date(c.created_at).toLocaleDateString(c.idioma === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
  return (
    <Marco marca={c.marca} nombre={marca?.nombre || c.marca}>
      <span className="pz__label">{marca?.nombre || c.marca} · v{c.version} · {fecha}</span>
      <h1>{c.titulo}</h1>
      <section className="pz__sec pz__solo"><TextoCondiciones texto={c.texto} /></section>
    </Marco>
  )
}

async function borrador(marca: string, idioma: string): Promise<Condiciones | null> {
  const texto = await readFile(`${process.cwd()}/condiciones/${marca}-v1.md`, 'utf8').catch(() => null)
  return texto ? { id: 0, marca, version: 1, idioma, titulo: idioma === 'en' ? 'Terms of service' : 'Condiciones del servicio', texto, created_at: new Date().toISOString() } : null
}
