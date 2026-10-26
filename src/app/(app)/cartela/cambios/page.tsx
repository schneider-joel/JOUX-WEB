import { supabaseServer as sb } from '@/lib/supabase-server'
import { firmarAdjuntos, type Peticion } from '@/lib/cartela-cambios'
import { Peticiones } from './bandeja'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Cambios · Cartela · JOUX Hub' }

// Bandeja de cambios de Cartela (fase 1): lo que piden los locales desde su enlace, por local.
// Joel lo aplica con el motor y lo marca aquí; el cliente ve el estado y la nota en su enlace.
export default async function CambiosCartelaPage() {
  const [{ data: locales }, { data: peticiones }] = await Promise.all([
    sb.from('cartela_locales').select('id, nombre, slug, plan, url_carta, token_cambios, estado, prueba').neq('estado', 'baja').order('nombre'),
    sb.from('cartela_peticiones').select('id, local_id, texto, adjuntos, estado, nota, created_at, actualizada_at').order('created_at', { ascending: false }).limit(300),
  ])
  const todas = (peticiones || []) as Peticion[]
  const fotos = await firmarAdjuntos(todas.flatMap(p => p.adjuntos))
  const abiertas = todas.filter(p => p.estado !== 'publicada').length

  return (
    <main className="main">
      <header className="page-header">
        <div className="page-header__txt">
          <h1 className="page-title">Cambios</h1>
          <p className="tags caps">Cartela · {abiertas ? `${abiertas} por hacer` : 'nada por hacer'}</p>
        </div>
      </header>
      {!(locales || []).length && <p className="empty">Aún no hay locales con enlace de cambios.</p>}
      {(locales || []).map(l => {
        const suyas = todas.filter(p => p.local_id === l.id)
        return (
          <section key={l.id} className="block" aria-label={l.nombre}>
            <p className="label caps">
              <span>{l.nombre}{l.prueba ? ' · prueba' : ''}</span><i className="rule" />
              <span className="label__m">{l.plan}{l.estado === 'pausado' ? ' · en pausa' : ''}</span>
            </p>
            <p className="nota">
              <a href={`/cambios/${l.token_cambios}`} target="_blank" rel="noopener">Su enlace de cambios ↗</a>
              {l.url_carta ? <> · <a href={l.url_carta} target="_blank" rel="noopener">Carta ↗</a></> : null}
            </p>
            {suyas.length
              ? <Peticiones lista={suyas.map(p => ({ ...p, fotos: p.adjuntos.map(r => fotos.get(r)).filter(Boolean) as string[] }))} />
              : <p className="nota">Sin peticiones todavía.</p>}
          </section>
        )
      })}
    </main>
  )
}
