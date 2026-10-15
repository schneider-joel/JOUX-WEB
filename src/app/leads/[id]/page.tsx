import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ETIQUETA_ESTADO, esEstadoLead, fechaHora, hace, type Evento, type Lead } from '@/lib/leads'
import CambiarEstado from './cambiar-estado'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Lead · JOUX Hub', robots: { index: false, follow: false } }

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const peso = (b?: number | null) => b == null ? '' : b < 1024 * 1024 ? `${new Intl.NumberFormat('es-ES', agrupar).format(Math.round(b / 1024))} KB` : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, ...agrupar }).format(b / 1024 / 1024)} MB`
// Valores de `interes` y `campos` tal cual llegaron: texto, número o JSON compacto.
const valor = (v: unknown) => v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

function textoEvento(e: Evento) {
  if (e.tipo === 'lead.nuevo') return `Lead recibido desde ${valor(e.datos.origen)}`
  if (e.tipo === 'lead.estado') {
    const de = esEstadoLead(e.datos.de) ? ETIQUETA_ESTADO[e.datos.de] : valor(e.datos.de)
    const a = esEstadoLead(e.datos.a) ? ETIQUETA_ESTADO[e.datos.a] : valor(e.datos.a)
    return `Estado: ${de} → ${a}`
  }
  return e.tipo
}

export default async function LeadPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { data } = Number.isInteger(id) ? await sb.from('leads').select('*').eq('id', id).maybeSingle() : { data: null }
  const lead = data as Lead | null

  const marco = (hijos: React.ReactNode) => (
    <div className="app">
      <header className="frame frame--top caps">
        <Link href="/" className="mark" style={{ textDecoration: 'none' }}>JOUX HUB</Link>
        <Link href="/pipeline" className="copy">← Pipeline</Link>
      </header>
      <main className="main main--col">{hijos}</main>
    </div>
  )
  if (!lead) return marco(<p className="empty">Este lead no existe.</p>)

  const [{ data: eventos }, { data: marca }] = await Promise.all([
    sb.from('eventos').select('id, tipo, fuente, datos, created_at').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    sb.from('marcas').select('nombre').eq('key', lead.marca).maybeSingle(),
  ])
  const interes = Object.entries(lead.interes || {}).filter(([, v]) => v != null && v !== '')
  const campos = Object.entries(lead.campos || {})

  return marco(
    <>
      <header className="page-header lead__head">
        <div className="page-header__txt">
          <h1 className="page-title">{lead.nombre || lead.email}</h1>
          <p className="tags caps">{marca?.nombre || lead.marca} · {hace(lead.recibido_en)}</p>
        </div>
        <CambiarEstado id={lead.id} estado={lead.estado} />
      </header>

      <div className="col">
        <section className="block" aria-label="Contacto">
          <p className="label caps"><span>Contacto</span><i className="rule" /></p>
          <dl className="meta lead__meta">
            <div><dt>Email</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd></div>
            {lead.empresa && <div><dt>Empresa</dt><dd>{lead.empresa}</dd></div>}
            {lead.telefono && <div><dt>Teléfono</dt><dd><a href={`tel:${lead.telefono.replace(/[^\d+]/g, '')}`}>{lead.telefono}</a></dd></div>}
            {lead.pais && <div><dt>País</dt><dd>{lead.pais}</dd></div>}
            <div><dt>Idioma</dt><dd>{lead.idioma === 'en' ? 'Inglés' : 'Español'}</dd></div>
            <div><dt>Origen</dt><dd>{lead.origen}</dd></div>
            <div><dt>Recibido</dt><dd>{fechaHora(lead.recibido_en)}</dd></div>
            <div><dt>Privacidad</dt><dd className={lead.consentimiento ? undefined : 'aviso'}>{lead.consentimiento ? 'Aceptada' : 'Sin consentimiento'}</dd></div>
          </dl>
        </section>

        {(lead.mensaje || interes.length > 0) && (
          <section className="block" aria-label="Qué quiere">
            <p className="label caps"><span>Qué quiere</span><i className="rule" /></p>
            {interes.length > 0 && (
              <dl className="meta lead__meta">
                {interes.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{valor(v)}</dd></div>)}
              </dl>
            )}
            {lead.mensaje && <p className="lead__msg">{lead.mensaje}</p>}
          </section>
        )}

        {lead.adjuntos?.length > 0 && (
          <section className="block" aria-label="Adjuntos">
            <p className="label caps"><span>Adjuntos</span><i className="rule" /><span className="label__m">{lead.adjuntos.length}</span></p>
            <ul className="list focus">
              {lead.adjuntos.map((a, i) => {
                const caducado = !!a.caduca && new Date(a.caduca) < new Date()
                return (
                  <li key={i}>
                    <a href={a.url?.startsWith('https://') ? a.url : undefined} target="_blank" rel="noopener noreferrer" className="fila pipe__lead">
                      <span className="fila__main">
                        <span className="fila__t">{a.nombre || `Adjunto ${i + 1}`}</span>
                        <span className={`fila__s caps${caducado ? ' aviso' : ''}`}>{[peso(a.bytes), a.caduca ? `${caducado ? 'caducó' : 'caduca'} ${fechaHora(a.caduca)}` : ''].filter(Boolean).join(' · ') || 'enlace'}</span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="block" aria-label="Línea de tiempo">
          <p className="label caps"><span>Línea de tiempo</span><i className="rule" /></p>
          {!eventos?.length ? <p className="nota">Sin eventos.</p> : (
            <ul className="list">
              {(eventos as Evento[]).map(e => (
                <li key={e.id} className="fila">
                  <span className="fila__main">
                    <span className="fila__t" style={{ fontSize: 15 }}>{textoEvento(e)}</span>
                    <span className="fila__s caps">{fechaHora(e.created_at)} · {e.fuente}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {campos.length > 0 && (
          <section className="block" aria-label="Formulario completo">
            <details>
              <summary className="label caps" style={{ cursor: 'pointer', listStyle: 'none' }}><span>Formulario completo</span><i className="rule" /><span className="label__m">{campos.length} campos</span></summary>
              <dl className="meta lead__meta" style={{ marginTop: 16 }}>
                {campos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{valor(v)}</dd></div>)}
              </dl>
            </details>
          </section>
        )}
      </div>
    </>
  )
}
