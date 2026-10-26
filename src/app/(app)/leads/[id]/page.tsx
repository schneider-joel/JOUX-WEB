import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { Fragment } from 'react'
import { ETAPAS_LEAD_VISTA, ETIQUETA_ESTADO, PARA_EMPEZAR, esEstadoLead, estadoLead, etapaLead, fechaHora, hace, type Evento, type Lead, type Mensaje } from '@/lib/leads'
import { remitenteLead } from '@/lib/remitentes'
import { precioPropuesto, type ClienteFiscal } from '@/lib/ganado'
import { MARCAS_TREATMENT } from '@/lib/seguimiento'
import { textoEvento } from '@/lib/eventos-texto'
import CambiarEstado from './cambiar-estado'
import AccionesLead from './ganado'
import Bienvenida from './bienvenida'
import Respuesta, { type Borrador } from './respuesta'
import PedirAjustes from './pedir-ajustes'
import { BotonChat, PanelChat } from './lead-chat'
import ParaEmpezarLista from './para-empezar'
import type { ItemHilo } from '../../proyectos/[id]/ficha'
import { disenoDelLead, estadoPrueba, urlsFirmadas, type AdjuntoMensaje } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Lead · JOUX Hub', robots: { index: false, follow: false } }

const PARA_EMPEZAR_MARCAS = Object.keys(PARA_EMPEZAR)
const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const peso = (b?: number | null) => b == null ? '' : b < 1024 * 1024 ? `${new Intl.NumberFormat('es-ES', agrupar).format(Math.round(b / 1024))} KB` : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, ...agrupar }).format(b / 1024 / 1024)} MB`
// Valores de `interes` y `campos` tal cual llegaron: texto, número o JSON compacto.
const valor = (v: unknown) => v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export default async function LeadPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { data } = Number.isInteger(id) ? await sb.from('leads').select('*').eq('id', id).maybeSingle() : { data: null }
  const lead = data as Lead | null

  // El menú y las migas los pone el marco del hub ((app)/layout.tsx).
  const marco = (hijos: React.ReactNode) => <main className="main main--col">{hijos}</main>
  if (!lead) return marco(<p className="empty">Este lead no existe.</p>)

  const [{ data: eventos }, { data: mensajes }, { data: marca }, { data: clientes }, { data: proyecto }, { data: pago1 }] = await Promise.all([
    sb.from('eventos').select('id, tipo, fuente, datos, created_at').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    sb.from('mensajes').select('id, direccion, estado, generado_por, remitente, para, asunto, cuerpo, error, enviado_en, created_at, auto, plantilla, adjuntos, proyecto_id').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle(),
    sb.from('clientes_fiscales').select('cliente, identificador, direccion, pais').order('cliente'),
    lead.proyecto_id ? sb.from('proyectos').select('id, nombre, cliente, marca, fase, precio_cerrado, prueba, drive_url, drive_error').eq('id', lead.proyecto_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.proyecto_id ? sb.from('facturas').select('id, numero').eq('proyecto_id', lead.proyecto_id).eq('pago', 1).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const interes = Object.entries(lead.interes || {}).filter(([, v]) => v != null && v !== '')
  const campos = Object.entries(lead.campos || {})
  const msgs = (mensajes || []) as Mensaje[]
  const bienvenidaEnviada = msgs.some(m => m.plantilla === 'proyecto.bienvenida' && m.estado === 'enviado')
  const bienvenidaConFactura = (eventos || []).some(e => e.tipo === 'mensaje.enviado' && e.datos?.plantilla === 'proyecto.bienvenida' && e.datos?.factura)
  const facturaPendiente = !!proyecto && proyecto.precio_cerrado != null && bienvenidaEnviada && !bienvenidaConFactura && !msgs.some(m => m.plantilla === 'factura.pago' && m.estado === 'enviado')
  // Adjuntos de las respuestas (bucket privado `leads`): enlaces firmados de 1 h, pedidos de una vez.
  const adjuntosMsg = msgs.flatMap(m => (m.adjuntos || []).map(a => ({ ...a, mensaje: m.id })))
  const firmadas = await urlsFirmadas(adjuntosMsg.map(a => a.ruta))
  const adjuntosDe = (id: number) => adjuntosMsg.flatMap((a, i) => a.mensaje === id ? [{ nombre: a.nombre, url: firmadas[i], peso: peso(a.bytes) }] : [])
  const prueba = estadoPrueba((eventos || []) as Evento[], msgs)
  // Para «Pedir ajustes»: la última respuesta del cliente después de publicar la prueba, como punto de partida.
  const respuestaPrueba = prueba?.lista ? msgs.find(m => m.direccion === 'entrante' && (m.enviado_en || m.created_at) > prueba.lista!.fecha) ?? null : null
  const paso = (hecho: boolean, texto: React.ReactNode, aviso = false) => <li className={aviso ? 'prueba__paso--aviso' : hecho ? 'prueba__paso--hecho' : undefined}>{texto}</li>
  const enlace = (l: { url: string | null; diseno: string | null }, texto: string) => l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer">{texto}{l.diseno ? ` · ${l.diseno}` : ''}</a> : texto
  // El borrador vivo (o el que falló al enviar) va al editor; el resto, al hilo.
  const borrador = msgs.find(m => m.direccion === 'saliente' && (m.estado === 'borrador' || m.estado === 'error')) || null
  // Hilo: mensajes enviados y recibidos + eventos (sin los de envío/recepción, que ya son el propio mensaje), lo último arriba.
  const hilo = [
    ...msgs.filter(m => m.estado === 'enviado' || m.estado === 'recibido').map(m => ({ clave: `m${m.id}`, fecha: m.enviado_en || m.created_at, m })),
    ...((eventos || []) as Evento[]).filter(e => e.tipo !== 'mensaje.enviado' && e.tipo !== 'mensaje.recibido').map(e => ({ clave: `e${e.id}`, fecha: e.created_at, e })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  // Panel de conversación (el de la ficha del proyecto): emails y avisos en orden, con sus adjuntos.
  const remitente = remitenteLead(lead.marca, lead.idioma)
  // Sin los cambios de estado ni los borradores descartados o regenerados: ruido en una conversación.
  const hiloPanel: ItemHilo[] = [...hilo].reverse().filter(x => 'm' in x || !['lead.estado', 'ia.borrador', 'mensaje.descartado'].includes(x.e.tipo)).map(x => 'm' in x
    ? { tipo: 'msg' as const, clave: x.clave, fecha: x.fecha, m: { id: x.m.id, entrante: x.m.direccion === 'entrante', estado: x.m.estado, asunto: x.m.asunto, cuerpo: x.m.cuerpo, error: x.m.error, plantilla: x.m.plantilla || null, auto: !!x.m.auto, deProyecto: !!(x.m as Mensaje & { proyecto_id?: number | null }).proyecto_id && !!x.m.plantilla, de: x.m.remitente, para: x.m.para, adjuntos: adjuntosDe(x.m.id).map(a => ({ nombre: a.nombre, url: a.url || null })) } }
    : { tipo: 'aviso' as const, clave: x.clave, fecha: x.fecha, texto: textoEvento(x.e) })
  const nombre = lead.nombre || lead.email
  const ultimoEntrante = msgs.find(m => m.direccion === 'entrante')
  const titulo = lead.empresa || nombre
  const abierto = !['ganado', 'perdido', 'spam'].includes(lead.estado)
  const conBienvenida = !!proyecto && (marca?.modo === 'cerrado' || MARCAS_TREATMENT.includes(marca?.key || ''))
  const acciones = marca && !proyecto ? <AccionesLead lead={lead} marca={marca} clientes={(clientes || []) as ClienteFiscal[]}
    propuesto={marca.modo === 'cerrado' ? precioPropuesto(msgs.filter(m => m.direccion === 'saliente' && m.estado === 'enviado').map(m => ({ cuerpo: m.cuerpo, fecha: m.enviado_en || m.created_at })), lead.marca === 'arkevo' ? disenoDelLead(lead) : null) : null} /> : null
  const respuesta = <Respuesta leadId={lead.id} borrador={borrador as Borrador | null} remitente={remitente}
    conIa={['arkevo', 'pitchlab', 'custom', 'cartela'].includes(lead.marca)} resumen={lead.resumen_ia} categoria={lead.categoria_ia} />

  // Una sola caja con lo que toca ahora (rediseño comercial, fase 3), con su herramienta dentro: la respuesta,
  // «Marcar ganado», la bienvenida o la factura. Si no toca nada, a qué se espera (la misma línea que en Work).
  const vista = estadoLead(lead)
  const caja: { k: 'tu' | 'espera' | 'parado' | 'ok'; titulo: string; sub?: string; dentro?: React.ReactNode; enCaja?: 'acciones' | 'respuesta' } =
    conBienvenida && !bienvenidaEnviada ? { k: 'tu', titulo: 'Envía la bienvenida', sub: marca?.modo === 'cerrado' ? 'Con la factura del pago 1.' : 'Con la carpeta de Drive.', dentro: <Bienvenida proyectoId={proyecto!.id} /> }
    : marca?.modo === 'cerrado' && facturaPendiente ? { k: 'tu', titulo: 'Envía la factura del pago 1', sub: 'Ya ha rellenado sus datos fiscales.', dentro: <Bienvenida proyectoId={proyecto!.id} clave="factura.pago" /> }
    : proyecto ? { k: 'ok', titulo: 'Ganado: sigue en el proyecto', dentro: <Link className="pill pill--sm" href={`/proyectos/${proyecto.id}`} style={{ alignSelf: 'flex-start' }}>Abrir el proyecto</Link> }
    : !abierto ? { k: 'ok', titulo: ETIQUETA_ESTADO[lead.estado as 'perdido' | 'spam'] || lead.estado }
    : borrador ? { k: 'tu', titulo: borrador.estado === 'error' ? 'La respuesta no salió: revísala y reintenta' : 'Revisa la respuesta y envíala', dentro: respuesta, enCaja: 'respuesta' }
    : vista.texto.startsWith('Tiene todo') ? { k: 'tu', titulo: 'Tiene todo: marca ganado', sub: 'Se crea el proyecto y lo siguiente es la bienvenida con la factura.', dentro: acciones, enCaja: 'acciones' }
    : lead.estado === 'nuevo' || lead.estado === 'conversacion' ? { k: 'tu', titulo: lead.estado === 'nuevo' ? `Responde a ${nombre}` : `${nombre} ha respondido: contéstale`, dentro: respuesta, enCaja: 'respuesta' }
    : { k: vista.k, titulo: vista.texto }

  return (
    <main className="main fx">
      <header className="fx__top">
        <div className="fx__tit">
          <h1>{titulo}</h1>
          <div className="fx__facts">
            <span>{marca?.nombre || lead.marca}</span>
            {lead.empresa && <><span aria-hidden="true">·</span><span>{nombre}</span></>}
            <span aria-hidden="true">·</span><span>{hace(lead.recibido_en)}</span>
            {!abierto && <span className={`fx__tag${lead.estado === 'ganado' ? ' ok' : ''}`}>{esEstadoLead(lead.estado) ? ETIQUETA_ESTADO[lead.estado] : lead.estado}</span>}
            {lead.prueba && <span className="fx__tag aviso">Prueba</span>}
          </div>
        </div>
        <div className="fx__acts">
          {proyecto && <Link className="ghost" href={`/proyectos/${proyecto.id}`}>Proyecto</Link>}
          <BotonChat badge={0} />
          <CambiarEstado id={lead.id} estado={lead.estado} />
        </div>
      </header>

      {abierto && (
        <div className="wk__etapas fx__barra" style={{ ['--n' as string]: ETAPAS_LEAD_VISTA.length }}>
          <span className="wk__barra" aria-hidden="true">{ETAPAS_LEAD_VISTA.map((e, i) => <i key={e} className={i < etapaLead(lead) ? 'is-hecho' : i === etapaLead(lead) ? 'is-ahora' : ''} />)}</span>
          <span className="wk__etiqueta">{ETAPAS_LEAD_VISTA.map((e, i) => <span key={e} className={i === etapaLead(lead) ? 'is-ahora' : ''}>{e}</span>)}</span>
        </div>
      )}

      <section className={`fx__caja is-${caja.k}`} aria-label="Ahora">
        <span className="caps">{caja.k === 'tu' ? 'Te toca' : caja.k === 'parado' ? 'Parado' : caja.k === 'ok' ? 'Hecho' : 'Esperando'}</span>
        <h2>{caja.titulo}</h2>
        {caja.sub && <p className="fx__sub">{caja.sub}</p>}
        {caja.dentro}
      </section>

      <div className="fx__grid">
        <div className="fx__col">
          {prueba && (
            <section className="fx__card" id="prueba" aria-labelledby="ld-pr">
              <header><h2 id="ld-pr">Prueba gratis</h2></header>
              <ol className="prueba caps">
                {paso(!!prueba.material, `Material${prueba.material ? ` · ${fechaHora(prueba.material)}` : ''}`)}
                {prueba.error && !prueba.ajustes
                  ? paso(false, `No se pudo montar · ${fechaHora(prueba.error.fecha)}`, true)
                  : paso(!!prueba.lista, prueba.lista ? enlace(prueba.lista, 'Prueba lista') : 'Prueba lista')}
                {paso(!!prueba.enviada, `Enviada${prueba.enviada ? ` · ${fechaHora(prueba.enviada)}` : ''}`)}
                {prueba.ajustes && <>
                  {paso(true, `Ajustes pedidos · ${fechaHora(prueba.ajustes.fecha)}`)}
                  {prueba.error
                    ? paso(false, `No se pudo ajustar · ${fechaHora(prueba.error.fecha)}`, true)
                    : paso(!!prueba.ajustada, prueba.ajustada ? enlace(prueba.ajustada, 'Ajustes listos') : 'Ajustes listos')}
                  {paso(!!prueba.ajustadaEnviada, `Enviada${prueba.ajustadaEnviada ? ` · ${fechaHora(prueba.ajustadaEnviada)}` : ''}`)}
                </>}
              </ol>
              {prueba.error && <p className="nota aviso">{prueba.error.motivo}</p>}
              {prueba.ajustes && !prueba.ajustada && !prueba.error && <p className="nota" style={{ whiteSpace: 'pre-wrap' }}>El agente tiene los ajustes:{'\n'}{prueba.ajustes.peticion}</p>}
              {prueba.lista && prueba.enviada && !prueba.ajustes && (
                <PedirAjustes leadId={lead.id} sugerencia={respuestaPrueba?.cuerpo || ''} mensajeId={respuestaPrueba?.id ?? null} />
              )}
            </section>
          )}

          {(lead.mensaje || interes.length > 0 || lead.resumen_ia) && (
            <section className="fx__card" aria-labelledby="ld-qq">
              <header><h2 id="ld-qq">Qué quiere</h2></header>
              {lead.resumen_ia && <p className="fx__sub">{lead.resumen_ia}</p>}
              {interes.length > 0 && (
                <dl className="fx__kv">
                  {interes.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{valor(v)}</dd></Fragment>)}
                </dl>
              )}
              {lead.mensaje && <p className="lead__msg">{lead.mensaje}</p>}
            </section>
          )}

          <section className="fx__card" aria-labelledby="ld-co">
            <header><h2 id="ld-co">Conversación</h2><span className="caps dim">{msgs.filter(m => m.estado === 'enviado' || m.estado === 'recibido').length} emails</span></header>
            <BotonChat badge={0} barra={{ nombre, linea: ultimoEntrante ? `Último suyo: «${ultimoEntrante.asunto || ultimoEntrante.cuerpo.slice(0, 60)}» · ${hace(ultimoEntrante.enviado_en || ultimoEntrante.created_at)}` : hilo.length ? `${hilo.length} cosas en el hilo` : 'Sin emails todavía' }} />
          </section>

          {/* «Marcar ganado» y «Marcar perdido» siempre a mano (si no están ya en la caja) */}
          {acciones && caja.enCaja !== 'acciones' && <section className="fx__card" aria-label="Ganado o perdido">{acciones}</section>}
        </div>

        <aside className="fx__col">
          {PARA_EMPEZAR_MARCAS.includes(lead.marca) && abierto && (
            <section className="fx__card" aria-labelledby="ld-pe">
              <header><h2 id="ld-pe">Para empezar</h2><span className="caps dim">IA o tú</span></header>
              <ParaEmpezarLista leadId={lead.id} marca={lead.marca} valor={lead.para_empezar || {}} />
            </section>
          )}

          <section className="fx__card" aria-labelledby="ld-ct">
            <header><h2 id="ld-ct">Contacto</h2></header>
            <dl className="fx__kv">
              <dt>Email</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd>
              {lead.telefono && <><dt>Teléfono</dt><dd><a href={`tel:${lead.telefono.replace(/[^\d+]/g, '')}`}>{lead.telefono}</a></dd></>}
              {lead.pais && <><dt>País</dt><dd>{lead.pais}</dd></>}
              <dt>Idioma</dt><dd>{lead.idioma === 'en' ? 'Inglés' : 'Español'}</dd>
              <dt>Recibido</dt><dd>{fechaHora(lead.recibido_en)}</dd>
              <dt>Privacidad</dt><dd className={lead.consentimiento ? undefined : 'aviso'}>{lead.consentimiento ? 'Aceptada' : 'Sin consentimiento'}</dd>
            </dl>
          </section>

          {lead.adjuntos?.length > 0 && (
            <section className="fx__card" aria-labelledby="ld-ad">
              <header><h2 id="ld-ad">Adjuntos</h2><span className="caps dim">{lead.adjuntos.length}</span></header>
              <ul className="fx__links">
                {lead.adjuntos.map((a, i) => {
                  const caducado = !!a.caduca && new Date(a.caduca) < new Date()
                  return <li key={i}><a href={a.url?.startsWith('https://') ? a.url : undefined} target="_blank" rel="noopener noreferrer"><span>{a.nombre || `Adjunto ${i + 1}`}</span><span className={`caps ${caducado ? 'aviso' : 'dim'}`}>{caducado ? 'caducado' : peso(a.bytes) || 'enlace'}</span></a></li>
                })}
              </ul>
            </section>
          )}

          {campos.length > 0 && (
            <details className="fx__card fx__notas">
              <summary className="copy caps">Formulario completo · {campos.length} campos</summary>
              <dl className="fx__kv" style={{ marginTop: 12 }}>
                {campos.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{valor(v)}</dd></Fragment>)}
              </dl>
            </details>
          )}
        </aside>
      </div>

      <PanelChat c={{ nombre, email: lead.email, remitente, leadId: lead.id, hilo: hiloPanel, enviarA: remitente ? `/api/leads/${lead.id}/mensaje` : null, sinEscribir: 'Esta marca no tiene remitente de Gmail.', ocultarBorradores: true }} />
    </main>
  )
}
