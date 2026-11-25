import { readFile } from 'fs/promises'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DOMINIO_PRESUPUESTO, marcaDeHost } from '@/lib/dominios-presupuesto'
import { enlaceCondiciones, enlacePresupuesto, PORTAL_MARCAS, type Presupuesto } from '@/lib/presupuestos'
import { portalDeToken, type EtapaPortal, type Portal, type FacturaPortal, type ProyectoPortal } from '@/lib/portal'
import { dinero } from '@/lib/moneda'
import TextoCondiciones from '../../condiciones/texto'
import { Marco } from '../marca'
import FormAceptar from './form'
import Dashboard from './dashboard'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Presupuesto · Quote', robots: { index: false, follow: false } }

const T = {
  es: {
    titulo: 'Presupuesto', proyecto: 'Proyecto', plan: 'Plan', precio: 'Precio', tarifa: 'Tarifa', dias: 'Días estimados', total: 'Total estimado',
    pagos: (a: string, b: string, cuando: string) => `50 % para empezar (${a}) y 50 % ${cuando} (${b}).`, entrega: 'Se factura todo a la entrega, por los días trabajados.',
    cuando: { cartela: 'al entregar la carta', otro: 'antes de publicar' } as Record<string, string>,
    incluye: 'Incluye', noIncluye: 'No incluye', despues: 'Después del lanzamiento', necesito: 'Qué necesito de ti', pago: 'Pago',
    plazo: 'Plazo', valido: 'Válido hasta', iva: 'Precios sin IVA.', dia: '/día',
    condiciones: 'Condiciones del servicio', leer: 'Leer las condiciones', abrir: 'Abrir en otra página',
    aceptadoTit: 'Presupuesto aceptado', dudas: '¿Alguna duda? Escríbeme a',
    aceptado: (n: string, f: string) => `Aceptado por ${n} el ${f}. Te hemos enviado una copia por email y en breve te escribimos con los siguientes pasos.`,
    aceptadoPortal: (n: string, f: string) => `Aceptado por ${n} el ${f}.`,
    anulado: 'Este presupuesto ya no está vigente. Responde al email y te mandamos uno nuevo.',
    caducado: 'Este presupuesto ha caducado. Responde al email y te mandamos uno actualizado.',
    volver: 'Volver a tu proyecto', tuPresupuesto: 'Tu presupuesto', verPresupuesto: 'Ver el presupuesto y las condiciones',
    estado: {
      factura: ['Presupuesto aceptado', 'Estoy preparando tu primera factura. Aparecerá aquí, con cómo pagarla.'],
      pago: ['Tu primera factura está lista', 'El proyecto empieza oficialmente en cuanto llega el primer pago.'],
      proyecto: ['En marcha', ''],
      lanzamiento: ['Tu web está publicada', ''],
    } as Record<Exclude<EtapaPortal, 'propuesta'>, [string, string]>,
    pasos: { kickoff: ['Arranque', 'Primer pago y lo necesario para empezar.'], material: ['Material', 'Me mandas lo que falta y lo preparo.'], build: ['Construcción', 'Monto la web en tu enlace privado de revisión.'], review: ['Revisión', 'Dejas tus notas en el modo revisión y hago los cambios.'], launch: ['Lanzamiento', 'Conecto el dominio y la web sale publicada.'] } as Record<string, [string, string]>,
    ahora: 'Ahora', hecho: 'Hecho',
    tuyo: 'Lo que necesito de ti', todoListo: 'Nada pendiente por tu parte.',
    revision: 'Modo revisión', revisionTxt: 'Tu enlace privado a la web en construcción. Pulsa en cualquier cosa y deja una nota.', abrirRevision: 'Abrir el modo revisión',
    enVivo: 'Tu web', abrirWeb: 'Ver la web', dominio: 'Dominio', conectado: 'Conectado', pendiente: 'Pendiente de conectar',
    facturas: 'Facturas', pago1: 'Primer pago', pago2: 'Pago final', factura: 'Factura', cobrada: 'Pagada', porPagar: 'Por pagar', vence: 'vence el', descargar: 'Ver y descargar',
    comoPagar: 'Cómo pagar', ref: (n: string) => `Pon el número de factura (${n}) como referencia.`,
    vacio: 'Enlace no válido',
  },
  en: {
    titulo: 'Quote', proyecto: 'Project', plan: 'Plan', precio: 'Price', tarifa: 'Day rate', dias: 'Estimated days', total: 'Estimated total',
    pagos: (a: string, b: string, cuando: string) => `50% to start (${a}) and 50% ${cuando} (${b}).`, entrega: 'Invoiced once on delivery, for the days worked.',
    cuando: { cartela: 'on delivery of the menu', otro: 'before launch' } as Record<string, string>,
    incluye: "What's included", noIncluye: 'Not included', despues: 'After launch', necesito: 'What I need from you', pago: 'Payment',
    plazo: 'Timing', valido: 'Valid until', iva: 'Prices exclude VAT.', dia: '/day',
    condiciones: 'Terms of service', leer: 'Read the terms', abrir: 'Open in a new page',
    aceptadoTit: 'Quote accepted', dudas: 'Any questions? Write to',
    aceptado: (n: string, f: string) => `Accepted by ${n} on ${f}. We have emailed you a copy and will be in touch shortly with the next steps.`,
    aceptadoPortal: (n: string, f: string) => `Accepted by ${n} on ${f}.`,
    anulado: 'This quote is no longer valid. Reply to the email and we will send you a new one.',
    caducado: 'This quote has expired. Reply to the email and we will send you an updated one.',
    volver: 'Back to your project', tuPresupuesto: 'Your quote', verPresupuesto: 'See the quote and the terms',
    estado: {
      factura: ['Quote accepted', "I'm preparing your first invoice. It will show up right here, with how to pay it."],
      pago: ['Your first invoice is ready', 'The project officially starts as soon as the first payment comes in.'],
      proyecto: ['In progress', ''],
      lanzamiento: ['Your site is live', ''],
    } as Record<Exclude<EtapaPortal, 'propuesta'>, [string, string]>,
    pasos: { kickoff: ['Kick-off', 'First payment and what I need to start.'], material: ['Material', 'You send what is missing, I get it ready.'], build: ['Build', 'I build the site on your private review link.'], review: ['Review', 'You leave notes in review mode, I make the changes.'], launch: ['Launch', 'I connect the domain and the site goes live.'] } as Record<string, [string, string]>,
    ahora: 'Now', hecho: 'Done',
    tuyo: 'What I need from you', todoListo: 'Nothing pending on your side.',
    revision: 'Review mode', revisionTxt: 'Your private link to the site in progress. Click anything and leave a note.', abrirRevision: 'Open review mode',
    enVivo: 'Your site', abrirWeb: 'Visit the site', dominio: 'Domain', conectado: 'Connected', pendiente: 'Not connected yet',
    facturas: 'Invoices', pago1: 'First payment', pago2: 'Final payment', factura: 'Invoice', cobrada: 'Paid', porPagar: 'To pay', vence: 'due', descargar: 'View and download',
    comoPagar: 'How to pay', ref: (n: string) => `Please use the invoice number (${n}) as the reference.`,
    vacio: 'Link not valid',
  },
}

// Contacto de cada marca en el pie (los mismos alias que los emails, src/lib/remitentes.ts).
const CONTACTO: Record<string, string> = { arkevo: 'hola@arkevostudio.com', cartela: 'hola@cartela.live', custom: 'joel@joelschneider.io', pitchlab: 'hello@thepitchlab.xyz' }
const lineas = (s: string | null) => (s || '').split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)

// Dos pantallas en el mismo enlace (decisión de Joel, 2026-11-25): el presupuesto con «Aceptar» y, en las marcas
// con portal (PORTAL_MARCAS), el dashboard del proyecto tras aceptar (dashboard.tsx, datos de src/lib/portal.ts). El token (presupuestos.token) es la única llave.
export default async function AceptarPage({ params, searchParams }: { params: { token: string }; searchParams: { estado?: string; modo?: string; marca?: string; etapa?: string; ver?: string } }) {
  const d = params.token === 'demo' ? await demo(searchParams) : await portalDeToken(params.token)
  // En el subdominio de una marca solo se abren sus presupuestos; el enlace de Joux Hub de una marca con
  // subdominio (los primeros que se enviaron) lleva al suyo.
  const hostMarca = marcaDeHost(headers().get('host'))
  if (d && hostMarca && d.p.marca !== hostMarca) return <Marco marca="otra" nombre=""><h1>Enlace no válido</h1><p className="pz__nota">Link not valid.</p></Marco>
  if (d && !hostMarca && params.token !== 'demo' && DOMINIO_PRESUPUESTO[d.p.marca] && process.env.NODE_ENV === 'production') redirect(enlacePresupuesto(d.p.token, d.p.marca))
  if (!d) return <Marco marca="otra" nombre=""><h1>Enlace no válido</h1><p className="pz__nota">Link not valid. Revisa el enlace del email o responde a ese correo.</p></Marco>
  const { p, lead, etapa } = d
  const t = T[p.idioma]
  const loc = p.idioma === 'en' ? (p.moneda === 'USD' ? 'en-US' : 'en-GB') : 'es-ES'
  const fecha = (iso: string, hora = false) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString(loc, { day: 'numeric', month: 'long', year: 'numeric', ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Europe/Madrid' })
  const quien = lead?.empresa || lead?.nombre || ''

  // Marcas sin portal: el presupuesto de siempre.
  if (etapa === 'propuesta' && !PORTAL_MARCAS.includes(p.marca)) return (
    <Marco marca={p.marca} nombre={d.marca}>
      <span className="pz__label">{t.titulo}{quien ? ` · ${quien}` : ''}</span>
      <h1>{p.concepto}</h1>
      <Propuesta d={d} t={t} fecha={fecha} />
      <section className="pz__sec">
        {p.estado === 'aceptado' ? <p className="pz__hecho"><strong>{t.aceptadoTit}</strong>{t.aceptado(p.aceptado_nombre || '', fecha(p.aceptado_at!, true))}</p>
          : p.estado === 'anulado' ? <p className="pz__hecho">{t.anulado}</p>
          : d.caducado ? <p className="pz__hecho">{t.caducado}</p>
          : <FormAceptar token={p.token} idioma={p.idioma} nombre={lead?.nombre || ''} version={d.cond.version} />}
      </section>
      <Pie marca={p.marca} t={t} />
    </Marco>
  )

  // Marcas con portal: el dashboard desde el primer día (siempre las mismas tarjetas, que se van completando). Antes
  // de aceptar, el presupuesto y «Accept» se despliegan dentro de su tarjeta grande. Tras aceptar,
  // ?ver=presupuesto enseña lo aceptado, con la vuelta al dashboard.
  const contacto = CONTACTO[p.marca] || CONTACTO.custom
  const aqui = params.token === 'demo' ? `?etapa=${etapa}` : '?'
  const presupuesto = etapa === 'propuesta' ? <>
    <Propuesta d={d} t={t} fecha={fecha} />
    {p.estado === 'enviado' && !d.caducado && <section className="pz__sec"><FormAceptar token={p.token} idioma={p.idioma} nombre={lead?.nombre || ''} version={d.cond.version} /></section>}
  </> : null
  if (searchParams.ver !== 'presupuesto' || etapa === 'propuesta') return (
    <Marco marca={p.marca} nombre={d.marca} ancho>
      <Dashboard d={d} contacto={contacto} enlacePresupuesto={`${aqui}${aqui.length > 1 ? '&' : ''}ver=presupuesto`} presupuesto={presupuesto} />
    </Marco>
  )
  return (
    <Marco marca={p.marca} nombre={d.marca}>
      <a className="pz__volver" href={aqui === '?' ? '?' : aqui}>← {t.volver}</a>
      <span className="pz__label">{t.titulo}{quien ? ` · ${quien}` : ''}</span>
      <h1>{p.concepto}</h1>
      <Propuesta d={d} t={t} fecha={fecha} />
      <section className="pz__sec"><p className="pz__hecho"><strong>{t.aceptadoTit}</strong>{t.aceptadoPortal(p.aceptado_nombre || '', fecha(p.aceptado_at!, true))}</p></section>
      <Pie marca={p.marca} t={t} />
    </Marco>
  )
}

type Textos = typeof T.es | typeof T.en
type Fecha = (iso: string, hora?: boolean) => string

// El presupuesto completo: cifras, alcance, pago y condiciones. Lo mismo antes y después de aceptar.
function Propuesta({ d, t, fecha }: { d: Portal; t: Textos; fecha: Fecha }) {
  const { p, cond } = d
  const din = (n: number) => dinero(n, p.moneda, p.idioma)
  const precio = Number(p.precio), tarifa = Number(p.tarifa_dia), dias = Number(p.dias)
  const filas: [string, string][] = [
    ...(p.plan ? [[t.plan, p.plan] as [string, string]] : []),
    ...(p.modo === 'cerrado' ? [[t.precio, din(precio)] as [string, string]]
      : [[t.tarifa, `${din(tarifa)}${t.dia}`] as [string, string], ...(dias > 0 ? [[t.dias, String(dias).replace('.', p.idioma === 'en' ? '.' : ',')], [t.total, din(tarifa * dias)]] as [string, string][] : [])]),
    ...(p.plazo ? [[t.plazo, p.plazo] as [string, string]] : []),
    ...(p.caduca && p.estado === 'enviado' ? [[t.valido, fecha(p.caduca)] as [string, string]] : []),
  ]
  const listas: [string, string[]][] = [[t.incluye, lineas(p.incluye)], [t.noIncluye, lineas(p.no_incluye)], [t.despues, lineas(p.despues)], [t.necesito, lineas(p.necesito)]]
  const pago = p.nota_pago?.trim() || (p.modo === 'cerrado' ? t.pagos(din(precio / 2), din(precio / 2), t.cuando[p.marca] || t.cuando.otro) : t.entrega)
  return <>
    <section className="pz__sec" aria-label={t.titulo}>
      <dl className="pz__kv">
        {filas.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd className={k === t.precio || k === t.total ? 'pz__precio' : undefined}>{v}</dd></div>)}
      </dl>
    </section>
    {listas.filter(([, l]) => l.length).map(([titulo, l]) => (
      <section key={titulo} className="pz__sec">
        <span className="pz__label">{titulo}</span>
        <ul className="pz__lista">{l.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </section>
    ))}
    <section className="pz__sec">
      <span className="pz__label">{t.pago}</span>
      {pago.split('\n').filter(Boolean).map((x, i) => <p key={i} className="pz__nota">{x}</p>)}
      {!p.sin_iva && <p className="pz__nota">{t.iva}</p>}
    </section>
    <section className="pz__sec" aria-label={t.condiciones}>
      <span className="pz__label">{t.condiciones} · v{cond.version}</span>
      <details>
        <summary>{t.leer}</summary>
        <TextoCondiciones texto={cond.texto} />
      </details>
      <a className="pz__abrir" href={enlaceCondiciones(p.marca, cond.version, cond.idioma)} target="_blank" rel="noopener noreferrer">{t.abrir} ↗</a>
    </section>
  </>
}

function Pie({ marca, t }: { marca: string; t: Textos }) {
  const c = CONTACTO[marca] || CONTACTO.custom
  return <p className="pz__pie">{t.dudas} <a href={`mailto:${c}`}>{c}</a></p>
}

// Todos los estados con datos inventados, sin tocar la base (solo en local; en producción, 404 como cualquier token
// que no existe):
//   /aceptar/demo?marca=arkevo|cartela|custom&estado=aceptado|anulado|caducado   (&modo=dia: treatment de The Pitch Lab)
//   /aceptar/demo?etapa=propuesta|factura|pago|proyecto|lanzamiento            (portal de Custom, en inglés y USD)
async function demo(q: { estado?: string; modo?: string; marca?: string; etapa?: string }): Promise<Portal | null> {
  if (process.env.NODE_ENV === 'production') return null
  if (q.etapa) return demoPortal(q.etapa)
  const dia = q.modo === 'dia', marca = dia ? 'pitchlab' : ['cartela', 'custom'].includes(q.marca || '') ? q.marca! : 'arkevo'
  const texto = await readFile(`${process.cwd()}/condiciones/${marca}-v1.md`, 'utf8')
  const ej = DEMO[marca]
  const estado = q.estado === 'aceptado' || q.estado === 'anulado' ? q.estado : 'enviado'
  const p: Presupuesto = {
    ...vacio, marca, idioma: dia ? 'en' : 'es', modo: dia ? 'dia' : 'cerrado',
    concepto: ej.concepto, plan: ej.plan,
    precio: dia ? null : ej.precio, tarifa_dia: dia ? 450 : null, dias: dia ? 3 : null,
    incluye: ej.incluye, plazo: ej.plazo, caduca: q.estado === 'caducado' ? '2026-01-01' : '2026-12-31',
    estado, aceptado_at: estado === 'aceptado' ? new Date().toISOString() : null, aceptado_nombre: estado === 'aceptado' ? 'Marta Ruiz' : null,
  }
  const cond = { id: 0, marca, version: 1, idioma: p.idioma, titulo: dia ? 'Terms of service' : 'Condiciones del servicio', texto, created_at: new Date().toISOString() }
  return { p, marca: ej.nombre, cond, lead: { nombre: 'Marta Ruiz', empresa: ej.empresa, email: '' }, caducado: q.estado === 'caducado', etapa: 'propuesta', proyecto: null, facturas: [], pago: null, cliente: null }
}
const vacio: Presupuesto = {
  id: 0, lead_id: 0, marca: 'custom', token: 'demo', idioma: 'es', modo: 'cerrado', concepto: '', plan: null, precio: null, tarifa_dia: null, dias: null,
  incluye: null, plazo: null, caduca: null, condiciones_id: 0, moneda: 'EUR', sin_iva: false, no_incluye: null, despues: null, necesito: null, nota_pago: null,
  estado: 'enviado', aceptado_at: null, aceptado_nombre: null, aceptado_email: null, aceptado_ip: null, aceptado_ua: null, condiciones_sha256: null, proyecto_id: null, created_at: new Date().toISOString(),
}
const DEMO: Record<string, { nombre: string; empresa: string; concepto: string; plan: string | null; precio: number | null; incluye: string; plazo: string }> = {
  arkevo: { nombre: 'Arkevo', empresa: 'Estudio Norte', concepto: 'Web Estudio Norte · diseño Lino', plan: 'Lino', precio: 1900, incluye: 'Diseño Lino adaptado a vuestra marca\nHasta 12 obras con su ficha\nEspañol e inglés\nDos rondas de cambios', plazo: '3 semanas desde que llega el material' },
  cartela: { nombre: 'Cartela', empresa: 'Bar Ripoll', concepto: 'Carta digital Bar Ripoll', plan: 'Casa', precio: 690, incluye: 'Carta completa: comida, bebidas y vinos\nHasta 4 idiomas\nHasta 30 fotos retocadas\nCambios ilimitados en 12 h durante un año', plazo: 'Primera versión en 48 h' },
  custom: { nombre: 'Custom Websites', empresa: 'Estudio Vela', concepto: 'Web Estudio Vela', plan: null, precio: 2400, incluye: 'Diseño a medida\n5 páginas\nAnimaciones con GSAP\nDos rondas de cambios', plazo: '4 semanas desde que llega el contenido' },
  pitchlab: { nombre: 'The Pitch Lab', empresa: 'Halden Films', concepto: 'Treatment · Halden spot', plan: null, precio: null, incluye: "Director's treatment, 12–16 pages\nPrivate link and PDF", plazo: '3–4 days from the brief' },
}

// Portal de ejemplo: un director de EE. UU., en inglés y USD, con las condiciones en inglés del borrador.
async function demoPortal(e: string): Promise<Portal> {
  const etapa = (['propuesta', 'factura', 'pago', 'proyecto', 'lanzamiento'].includes(e) ? e : 'propuesta') as EtapaPortal
  const texto = await readFile(`${process.cwd()}/condiciones/custom-v2-en.md`, 'utf8').catch(() => readFile(`${process.cwd()}/condiciones/custom-v1.md`, 'utf8'))
  const aceptado = etapa !== 'propuesta'
  const p: Presupuesto = {
    ...vacio, idioma: 'en', moneda: 'USD', sin_iva: true, concepto: 'Director website', plan: 'Based on Reel', precio: 3500,
    incluye: 'Home page based on the Reel mock-up\nWork as a reel of looping previews, plus an index grid\nEvery spot you want, no cap\nAbout and Contact\nPrivate review mode\nDomain moved, hosting for the first year\nThree months of changes after launch',
    no_incluye: 'Private pages and tailored reels for agencies\nExtra pages like press or a stills archive',
    despues: 'First three months: new films and changes included\nAfter that: $90 per change or new film, or $129/month',
    necesito: 'The list of spots, with their Vimeo links\nYour thumbnails\nCredits for each spot\nAbout and Contact text',
    nota_pago: '$1,750 to start and $1,750 at launch, or four weeks after the site is ready for review, whichever comes first.\nYou can also pay it all upfront.',
    plazo: '3–4 weeks from the list of spots', caduca: '2026-12-23',
    estado: aceptado ? 'aceptado' : 'enviado', aceptado_at: aceptado ? '2026-11-25T16:20:00Z' : null, aceptado_nombre: aceptado ? 'Alex Rivera' : null,
  }
  const fase = etapa === 'proyecto' ? 'comenzado' : etapa === 'lanzamiento' ? 'entregado' : 'confirmado'
  const proyecto: ProyectoPortal | null = aceptado ? {
    fase, url_revision: 'https://revision-ejemplo.joelschneider.io', url_live: etapa === 'lanzamiento' ? 'https://alexrivera.com' : null,
    dominio: 'alexrivera.com', dominio_estado: etapa === 'lanzamiento' ? 'conectado' : 'pendiente',
    pendientes: [{ texto: 'The list of spots, with their Vimeo links', hecho: true }, { texto: 'Your thumbnails', hecho: etapa !== 'pago' }, { texto: 'About and Contact text', hecho: false }],
  } : null
  const f = (pago: number, cobrada: boolean): FacturaPortal => ({ id: pago, numero: `F-2026-${90 + pago}`, pago, fecha: '2026-11-25', vence: '2026-12-25', total: 1750, moneda: 'USD', cobrada, url: '/invoice/demo', prueba: false })
  const facturas = etapa === 'pago' ? [f(1, false)] : etapa === 'proyecto' ? [f(1, true)] : etapa === 'lanzamiento' ? [f(1, true), f(2, false)] : []
  return {
    p, marca: 'Custom Websites', cond: { id: 0, marca: 'custom', version: 2, idioma: 'en', titulo: 'Terms of service', texto, created_at: new Date().toISOString() },
    lead: { nombre: 'Alex Rivera', empresa: null, email: '' }, caducado: false, etapa, proyecto, facturas,
    pago: aceptado ? 'Bank transfer in USD (ACH or wire)\n[Wise account details]\n\nPayPal\n[PayPal email]' : null,
    cliente: aceptado ? { nombre: 'Alex Rivera', identificador: null, direccion: '123 Ocean Ave, Apt 4\nSanta Monica, CA 90401\nUnited States' } : null,
  }
}
