import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ETIQUETA_ESTADO, ETIQUETA_FASE, esEstadoLead, esFaseProyecto, fechaHora, hace, type Evento, type Lead, type Mensaje } from '@/lib/leads'
import { remitenteLead } from '@/lib/remitentes'
import type { ClienteFiscal } from '@/lib/ganado'
import CambiarEstado from './cambiar-estado'
import AccionesLead from './ganado'
import FacturarPago1 from './facturar-pago'
import Respuesta, { type Borrador } from './respuesta'
import EmailHilo from './email-hilo'
import { estadoPrueba, urlsFirmadas, type AdjuntoMensaje } from '@/lib/prueba-gratis'

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
  if (e.tipo === 'lead.ganado') return `Ganado: ${valor(e.datos.cliente)}${e.datos.cliente_nuevo ? ' (cliente nuevo)' : ''}${e.datos.tarifa_dia ? ` · €${valor(e.datos.tarifa_dia)}/día` : ''}`
  if (e.tipo === 'lead.perdido') return `Perdido${e.datos.motivo ? `: ${valor(e.datos.motivo)}` : ''}`
  if (e.tipo === 'ia.borrador') return `Borrador de IA${e.datos.motivo === 'regenerar' ? ' (regenerado)' : e.datos.motivo === 'respuesta' ? ' para su respuesta' : ''}${e.datos.categoria ? ` · ${valor(e.datos.categoria)}` : ''}`
  if (e.tipo === 'mensaje.descartado') return 'Borrador descartado'
  if (e.tipo === 'material.recibido') return `Material para la prueba gratis${e.datos.fotos ? ` · ${valor(e.datos.fotos)} fotos` : ''}${e.datos.diseno ? ` · ${valor(e.datos.diseno)}` : ''}`
  if (e.tipo === 'prueba.lista') return `Prueba gratis lista${e.datos.diseno ? ` en ${valor(e.datos.diseno)}` : ''}`
  if (e.tipo === 'prueba.error') return `El agente no pudo montar la prueba: ${valor(e.datos.motivo)}`
  if (e.tipo === 'proyecto.fase') return `Fase del proyecto: ${esFaseProyecto(e.datos.de) ? ETIQUETA_FASE[e.datos.de] : '—'} → ${esFaseProyecto(e.datos.a) ? ETIQUETA_FASE[e.datos.a] : valor(e.datos.a)}`
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

  const [{ data: eventos }, { data: mensajes }, { data: marca }, { data: clientes }, { data: proyecto }, { data: pago1 }] = await Promise.all([
    sb.from('eventos').select('id, tipo, fuente, datos, created_at').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    sb.from('mensajes').select('id, direccion, estado, generado_por, remitente, para, asunto, cuerpo, error, enviado_en, created_at, auto, plantilla, adjuntos').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle(),
    sb.from('clientes_fiscales').select('cliente, identificador, direccion, pais').order('cliente'),
    lead.proyecto_id ? sb.from('proyectos').select('id, nombre, cliente, fase, precio_cerrado').eq('id', lead.proyecto_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.proyecto_id ? sb.from('facturas').select('id, numero').eq('proyecto_id', lead.proyecto_id).eq('pago', 1).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const paisProyecto = proyecto ? (clientes || []).find(c => c.cliente === proyecto.cliente)?.pais ?? null : null
  const interes = Object.entries(lead.interes || {}).filter(([, v]) => v != null && v !== '')
  const campos = Object.entries(lead.campos || {})
  const msgs = (mensajes || []) as Mensaje[]
  // Adjuntos de las respuestas (bucket privado `leads`): enlaces firmados de 1 h, pedidos de una vez.
  const adjuntosMsg = msgs.flatMap(m => (m.adjuntos || []).map(a => ({ ...a, mensaje: m.id })))
  const firmadas = await urlsFirmadas(adjuntosMsg.map(a => a.ruta))
  const adjuntosDe = (id: number) => adjuntosMsg.flatMap((a, i) => a.mensaje === id ? [{ nombre: a.nombre, url: firmadas[i], peso: peso(a.bytes) }] : [])
  const prueba = estadoPrueba((eventos || []) as Evento[], msgs)
  // El borrador vivo (o el que falló al enviar) va al editor; el resto, al hilo.
  const borrador = msgs.find(m => m.direccion === 'saliente' && (m.estado === 'borrador' || m.estado === 'error')) || null
  // Hilo: mensajes enviados y recibidos + eventos (sin los de envío/recepción, que ya son el propio mensaje), lo último arriba.
  const hilo = [
    ...msgs.filter(m => m.estado === 'enviado' || m.estado === 'recibido').map(m => ({ clave: `m${m.id}`, fecha: m.enviado_en || m.created_at, m })),
    ...((eventos || []) as Evento[]).filter(e => e.tipo !== 'mensaje.enviado' && e.tipo !== 'mensaje.recibido').map(e => ({ clave: `e${e.id}`, fecha: e.created_at, e })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const ultimoEmail = hilo.find(x => 'm' in x)?.clave

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
        {proyecto ? (
          <section className="block" aria-label="Proyecto">
            <p className="label caps"><span>Proyecto</span><i className="rule" /></p>
            <dl className="meta lead__meta">
              <div><dt>Proyecto</dt><dd><Link href={`/pipeline${lead.marca ? `?marca=${lead.marca}` : ''}`}>{proyecto.nombre}</Link></dd></div>
              <div><dt>Cliente</dt><dd>{proyecto.cliente}</dd></div>
              <div><dt>Fase</dt><dd>{esFaseProyecto(proyecto.fase) ? ETIQUETA_FASE[proyecto.fase] : '—'}</dd></div>
              {pago1 && <div><dt>Pago 1</dt><dd><a href={`/invoice/${pago1.id}`} target="_blank" rel="noopener noreferrer">{pago1.numero || 'Factura'}</a></dd></div>}
            </dl>
            {marca?.modo === 'cerrado' && proyecto.precio_cerrado != null && !pago1 && (
              <FacturarPago1 proyectoId={proyecto.id} precio={Number(proyecto.precio_cerrado)} pais={paisProyecto} />
            )}
          </section>
        ) : marca && (
          <AccionesLead lead={lead} marca={marca} clientes={(clientes || []) as ClienteFiscal[]} />
        )}


        {prueba && (
          <section className="block" aria-label="Prueba gratis">
            <p className="label caps"><span>Prueba gratis</span><i className="rule" /></p>
            <ol className="prueba caps">
              <li className={prueba.material ? 'prueba__paso--hecho' : undefined}>Material{prueba.material ? ` · ${fechaHora(prueba.material)}` : ''}</li>
              {prueba.error ? (
                <li className="prueba__paso--aviso">No se pudo montar · {fechaHora(prueba.error.fecha)}</li>
              ) : (
                <li className={prueba.lista ? 'prueba__paso--hecho' : undefined}>
                  {prueba.lista?.url ? <a href={prueba.lista.url} target="_blank" rel="noopener noreferrer">Prueba lista{prueba.lista.diseno ? ` · ${prueba.lista.diseno}` : ''}</a> : 'Prueba lista'}
                </li>
              )}
              <li className={prueba.enviada ? 'prueba__paso--hecho' : undefined}>Enviada{prueba.enviada ? ` · ${fechaHora(prueba.enviada)}` : ''}</li>
            </ol>
            {prueba.error && <p className="nota aviso">{prueba.error.motivo}</p>}
            {prueba.lista && !prueba.enviada && <p className="nota">El email con el enlace está abajo, en «Respuesta». Revísalo y envíalo.</p>}
          </section>
        )}

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

        <Respuesta leadId={lead.id} borrador={borrador as Borrador | null} remitente={remitenteLead(lead.marca, lead.idioma)}
          conIa={['arkevo', 'pitchlab', 'custom'].includes(lead.marca)} resumen={lead.resumen_ia} categoria={lead.categoria_ia} />

        <section className="block" aria-label="Conversación">
          <p className="label caps"><span>Conversación</span><i className="rule" /></p>
          {!hilo.length ? <p className="nota">Sin eventos.</p> : (
            <ul className="hilo">
              {hilo.map(x => {
                if ('m' in x) {
                  const entrante = x.m.direccion === 'entrante'
                  // «Nombre <email>» → nombre en grande, email aparte.
                  const de = (entrante ? x.m.remitente : x.m.remitente || x.m.para) || ''
                  const partes = de.match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/)
                  return (
                    <EmailHilo key={x.clave} entrante={entrante} abierto={x.clave === ultimoEmail}
                      etiqueta={entrante ? 'Recibido' : x.m.auto ? 'Enviado automáticamente' : x.m.generado_por === 'joel' ? 'Enviado · editado' : 'Enviado'}
                      quien={partes?.[1] || de} direccion={partes ? partes[2] : null}
                      fecha={fechaHora(x.fecha)} asunto={x.m.asunto} cuerpo={x.m.cuerpo} adjuntos={adjuntosDe(x.m.id)} />
                  )
                }
                const alertas = Array.isArray(x.e.datos.alertas) ? (x.e.datos.alertas as unknown[]).map(String) : []
                return (
                  <li key={x.clave} className="hilo__evento">
                    <i className="hilo__punto" aria-hidden="true" />
                    <span className="hilo__evtxt">
                      <span>{textoEvento(x.e)}</span>
                      <span className="hilo__evfecha caps">{fechaHora(x.e.created_at)} · {x.e.fuente}</span>
                      {alertas.map((a, i) => <span key={i} className="hilo__alerta">⚠ {a}</span>)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

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
