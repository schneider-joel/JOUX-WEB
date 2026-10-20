import Link from 'next/link'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { ETIQUETA_ESTADO, ETIQUETA_FASE, esEstadoLead, esFaseProyecto, fechaHora, hace, type Evento, type Lead, type Mensaje } from '@/lib/leads'
import { remitenteLead } from '@/lib/remitentes'
import { precioPropuesto, type ClienteFiscal } from '@/lib/ganado'
import { MARCAS_TREATMENT } from '@/lib/seguimiento'
import { textoEvento } from '@/lib/eventos-texto'
import CambiarEstado from './cambiar-estado'
import AccionesLead from './ganado'
import Bienvenida from './bienvenida'
import DriveCarpeta from '@/app/(app)/work/drive-carpeta'
import { SUBCARPETAS } from '@/lib/drive-carpetas'
import Respuesta, { type Borrador } from './respuesta'
import PedirAjustes from './pedir-ajustes'
import { BotonChat, PanelChat } from './lead-chat'
import type { ItemHilo } from '../../proyectos/[id]/ficha'
import { disenoDelLead, estadoPrueba, urlsFirmadas, type AdjuntoMensaje } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Lead · JOUX Hub', robots: { index: false, follow: false } }

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
  // Lo que toca ahora con este lead (los botones de cada cosa están más abajo, en su bloque).
  const toca: { texto: string; sub: string; href: string; boton: string } | null =
    proyecto && (marca?.modo === 'cerrado' || MARCAS_TREATMENT.includes(marca?.key || '')) && !bienvenidaEnviada ? { texto: 'Envía la bienvenida', sub: 'Con la carpeta de Drive y, en las webs, la factura del pago 1', href: '#bienvenida', boton: 'Ir a la bienvenida' }
    : borrador ? { texto: borrador.estado === 'error' ? 'La respuesta no salió: revísala y reintenta' : 'Tienes una respuesta preparada', sub: borrador.asunto || 'Borrador', href: '#respuesta', boton: 'Revisar respuesta' }
    : prueba?.lista && !prueba.enviada ? { texto: 'La prueba gratis está lista', sub: 'Revísala y envíasela', href: '#prueba', boton: 'Ver la prueba' }
    : lead.estado === 'nuevo' ? { texto: `Responde a ${nombre}`, sub: 'Todavía no le has contestado', href: '#respuesta', boton: 'Responder' }
    : lead.estado === 'conversacion' ? { texto: `${nombre} ha respondido`, sub: ultimoEntrante?.asunto || 'Nuevo email', href: '#respuesta', boton: 'Contestar' }
    : null

  return marco(
    <>
      <header className="fx__top lead__head">
        <div className="fx__tit">
          <h1 className="lead__h1">{nombre}</h1>
          <div className="fx__facts">
            <span className={`fx__tag${['nuevo', 'borrador', 'conversacion'].includes(lead.estado) ? ' aviso' : lead.estado === 'ganado' ? ' ok' : ''}`}>{esEstadoLead(lead.estado) ? ETIQUETA_ESTADO[lead.estado] : lead.estado}</span>
            <span>{marca?.nombre || lead.marca}</span>
            {lead.empresa && <><span aria-hidden="true">·</span><span>{lead.empresa}</span></>}
            <span aria-hidden="true">·</span><span>{hace(lead.recibido_en)}</span>
          </div>
        </div>
        <div className="fx__acts">
          <BotonChat badge={borrador ? 1 : 0} />
          {proyecto && <Link className="ghost" href={`/proyectos/${proyecto.id}`}>Proyecto</Link>}
          <CambiarEstado id={lead.id} estado={lead.estado} />
        </div>
      </header>

      {toca && (
        <section className="fx__now lead__head lead__toca" aria-label="Lo que te toca">
          <span className="fx__ic" aria-hidden="true"><svg className="sh__i" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></span>
          <div className="fx__w"><b>{toca.texto}</b><span>{toca.sub}</span></div>
          <a className="pill pill--sm" href={toca.href}>{toca.boton}</a>
        </section>
      )}

      <div className="col">
        {proyecto ? (
          <section className="block" aria-label="Proyecto">
            <p className="label caps"><span>Proyecto</span><i className="rule" /></p>
            <dl className="meta lead__meta">
              <div><dt>Proyecto</dt><dd><Link href={`/proyectos/${proyecto.id}`}>{proyecto.nombre} · abrir la ficha →</Link></dd></div>
              <div><dt>Cliente</dt><dd>{proyecto.cliente}</dd></div>
              <div><dt>Fase</dt><dd>{esFaseProyecto(proyecto.fase) ? ETIQUETA_FASE[proyecto.fase] : '—'}</dd></div>
              {pago1 && <div><dt>Pago 1</dt><dd><a href={`/invoice/${pago1.id}`} target="_blank" rel="noopener noreferrer">{pago1.numero || 'Factura'}</a></dd></div>}
              {(proyecto.drive_url || SUBCARPETAS[proyecto.marca || '']) && <div><dt>Material</dt><dd><DriveCarpeta proyectoId={proyecto.id} url={proyecto.drive_url} error={proyecto.drive_error} /></dd></div>}
            </dl>
            {proyecto.prueba && <p className="nota aviso caps">Proyecto de prueba · sus facturas no tienen validez fiscal</p>}
            {/* Webs: bienvenida + carpeta de Drive + factura del pago 1 en un solo email, con vista previa */}
            {(marca?.modo === 'cerrado' || MARCAS_TREATMENT.includes(marca?.key || '')) && !bienvenidaEnviada && <div id="bienvenida"><Bienvenida proyectoId={proyecto.id} /></div>}
            {/* Si la bienvenida pidió los datos fiscales, la factura del pago 1 va en un segundo email */}
            {marca?.modo === 'cerrado' && facturaPendiente && <Bienvenida proyectoId={proyecto.id} clave="factura.pago" />}
          </section>
        ) : marca && (
          <AccionesLead lead={lead} marca={marca} clientes={(clientes || []) as ClienteFiscal[]}
            propuesto={marca.modo === 'cerrado' ? precioPropuesto(msgs.filter(m => m.direccion === 'saliente' && m.estado === 'enviado').map(m => ({ cuerpo: m.cuerpo, fecha: m.enviado_en || m.created_at })), lead.marca === 'arkevo' ? disenoDelLead(lead) : null) : null} />
        )}


        {prueba && (
          <section className="block" id="prueba" aria-label="Prueba gratis">
            <p className="label caps"><span>Prueba gratis</span><i className="rule" /></p>
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
            {((prueba.lista && !prueba.enviada) || (prueba.ajustada && !prueba.ajustadaEnviada)) && <p className="nota">El email con el enlace está abajo, en «Respuesta». Revísalo y envíalo.</p>}
            {prueba.ajustes && !prueba.ajustada && !prueba.error && <p className="nota" style={{ whiteSpace: 'pre-wrap' }}>El agente tiene los ajustes:{'\n'}{prueba.ajustes.peticion}</p>}
            {prueba.lista && prueba.enviada && !prueba.ajustes && (
              <PedirAjustes leadId={lead.id} sugerencia={respuestaPrueba?.cuerpo || ''} mensajeId={respuestaPrueba?.id ?? null} />
            )}
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

        <div id="respuesta">
          <Respuesta leadId={lead.id} borrador={borrador as Borrador | null} remitente={remitente}
            conIa={['arkevo', 'pitchlab', 'custom', 'cartela'].includes(lead.marca)} resumen={lead.resumen_ia} categoria={lead.categoria_ia} />
        </div>

        <section className="block" aria-label="Conversación">
          <p className="label caps"><span>Conversación</span><i className="rule" /><span className="label__m">{msgs.filter(m => m.estado === 'enviado' || m.estado === 'recibido').length} emails</span></p>
          <BotonChat badge={borrador ? 1 : 0} barra={{ nombre, linea: ultimoEntrante ? `Último suyo: «${ultimoEntrante.asunto || ultimoEntrante.cuerpo.slice(0, 60)}» · ${hace(ultimoEntrante.enviado_en || ultimoEntrante.created_at)}` : hilo.length ? `${hilo.length} cosas en el hilo` : 'Sin emails todavía' }} />
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

      <PanelChat c={{ nombre, email: lead.email, remitente, leadId: lead.id, hilo: hiloPanel, enviarA: remitente ? `/api/leads/${lead.id}/mensaje` : null, sinEscribir: 'Esta marca no tiene remitente de Gmail.', ocultarBorradores: true }} />
    </>
  )
}
