import { readFile } from 'fs/promises'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DOMINIO_PRESUPUESTO, marcaDeHost } from '@/lib/dominios-presupuesto'
import { presupuestoDeToken, enlaceCondiciones, enlacePresupuesto, type Presupuesto } from '@/lib/presupuestos'
import TextoCondiciones from '../../condiciones/texto'
import { Marco } from '../marca'
import FormAceptar from './form'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Presupuesto · Quote', robots: { index: false, follow: false } }

const T = {
  es: {
    titulo: 'Presupuesto', para: 'Para', plan: 'Plan', precio: 'Precio', tarifa: 'Tarifa', dias: 'Días estimados', total: 'Total estimado',
    pagos: (a: string, b: string, cuando: string) => `50 % para empezar (${a}) y 50 % ${cuando} (${b}).`, entrega: 'Se factura todo a la entrega, por los días trabajados.',
    cuando: { cartela: 'al entregar la carta', otro: 'antes de publicar' } as Record<string, string>,
    incluye: 'Incluye', plazo: 'Plazo', valido: 'Válido hasta', iva: 'Precios sin IVA.', dia: '/día',
    condiciones: 'Condiciones del servicio', leer: 'Leer las condiciones', abrir: 'Abrir en otra página',
    aceptadoTit: 'Presupuesto aceptado', dudas: '¿Alguna duda? Escríbenos a',
    aceptado: (n: string, f: string) => `Aceptado por ${n} el ${f}. Te hemos enviado una copia por email y en breve te escribimos con los siguientes pasos.`,
    anulado: 'Este presupuesto ya no está vigente. Responde al email y te mandamos uno nuevo.',
    caducado: 'Este presupuesto ha caducado. Responde al email y te mandamos uno actualizado.',
    vacio: 'Enlace no válido',
  },
  en: {
    titulo: 'Quote', para: 'For', plan: 'Plan', precio: 'Price', tarifa: 'Day rate', dias: 'Estimated days', total: 'Estimated total',
    pagos: (a: string, b: string, cuando: string) => `50% to start (${a}) and 50% ${cuando} (${b}).`, entrega: 'Invoiced once on delivery, for the days worked.',
    cuando: { cartela: 'on delivery of the menu', otro: 'before launch' } as Record<string, string>,
    incluye: 'Includes', plazo: 'Timing', valido: 'Valid until', iva: 'Prices exclude VAT.', dia: '/day',
    condiciones: 'Terms of service', leer: 'Read the terms', abrir: 'Open in a new page',
    aceptadoTit: 'Quote accepted', dudas: 'Any questions? Write to',
    aceptado: (n: string, f: string) => `Accepted by ${n} on ${f}. We have emailed you a copy and will be in touch shortly with the next steps.`,
    anulado: 'This quote is no longer valid. Reply to the email and we will send you a new one.',
    caducado: 'This quote has expired. Reply to the email and we will send you an updated one.',
    vacio: 'Link not valid',
  },
}

// Página pública del presupuesto: el detalle, las condiciones con las que se envió y la casilla para aceptarlas.
// El token (presupuestos.token) es la única llave.
// Contacto de cada marca en el pie (los mismos alias que los emails, src/lib/remitentes.ts).
const CONTACTO: Record<string, string> = { arkevo: 'hola@arkevostudio.com', cartela: 'hola@cartela.live', custom: 'joel@joelschneider.io', pitchlab: 'hello@thepitchlab.xyz' }

export default async function AceptarPage({ params, searchParams }: { params: { token: string }; searchParams: { estado?: string; modo?: string; marca?: string } }) {
  const d = params.token === 'demo' ? await demo(searchParams) : await presupuestoDeToken(params.token)
  // En el subdominio de una marca solo se abren sus presupuestos; el enlace de Joux Hub de una marca con
  // subdominio (los primeros que se enviaron) lleva al suyo.
  const hostMarca = marcaDeHost(headers().get('host'))
  if (d && hostMarca && d.p.marca !== hostMarca) return <Marco marca="otra" nombre=""><h1>Enlace no válido</h1><p className="pz__nota">Link not valid.</p></Marco>
  if (d && !hostMarca && params.token !== 'demo' && DOMINIO_PRESUPUESTO[d.p.marca] && process.env.NODE_ENV === 'production') redirect(enlacePresupuesto(d.p.token, d.p.marca))
  if (!d) return <Marco marca="otra" nombre=""><h1>Enlace no válido</h1><p className="pz__nota">Link not valid. Revisa el enlace del email o responde a ese correo.</p></Marco>
  const { p, cond, lead } = d
  const t = T[p.idioma]
  const loc = p.idioma === 'en' ? 'en-GB' : 'es-ES'
  const eur = (n: number) => new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)
  const fecha = (iso: string, hora = false) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString(loc, { day: 'numeric', month: 'long', year: 'numeric', ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Europe/Madrid' })
  const precio = Number(p.precio), tarifa = Number(p.tarifa_dia), dias = Number(p.dias)
  const incluye = (p.incluye || '').split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  const filas: [string, string][] = [
    [t.para, lead?.empresa || lead?.nombre || ''],
    ...(p.plan ? [[t.plan, p.plan] as [string, string]] : []),
    ...(p.modo === 'cerrado' ? [[t.precio, eur(precio)] as [string, string]]
      : [[t.tarifa, `${eur(tarifa)}${t.dia}`] as [string, string], ...(dias > 0 ? [[t.dias, String(dias).replace('.', p.idioma === 'en' ? '.' : ',')], [t.total, eur(tarifa * dias)]] as [string, string][] : [])]),
    ...(p.plazo ? [[t.plazo, p.plazo] as [string, string]] : []),
    ...(p.caduca && p.estado === 'enviado' ? [[t.valido, fecha(p.caduca)] as [string, string]] : []),
  ]

  return (
    <Marco marca={p.marca} nombre={d.marca}>
      <span className="pz__label">{t.titulo}{lead?.empresa || lead?.nombre ? ` · ${lead.empresa || lead.nombre}` : ''}</span>
      <h1>{p.concepto}</h1>

      <section className="pz__sec" aria-label={t.titulo}>
        <dl className="pz__kv">
          {filas.filter(([k, v]) => v && k !== t.para).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd className={k === t.precio || k === t.total ? 'pz__precio' : undefined}>{v}</dd></div>)}
        </dl>
      </section>

      {incluye.length > 0 && (
        <section className="pz__sec">
          <span className="pz__label">{t.incluye}</span>
          <ul className="pz__lista">{incluye.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}

      <section className="pz__sec">
        <p className="pz__nota">{p.modo === 'cerrado' ? t.pagos(eur(precio / 2), eur(precio / 2), t.cuando[p.marca] || t.cuando.otro) : t.entrega} {t.iva}</p>
      </section>

      <section className="pz__sec" aria-label={t.condiciones}>
        <span className="pz__label">{t.condiciones} · v{cond.version}</span>
        <details>
          <summary>{t.leer}</summary>
          <TextoCondiciones texto={cond.texto} />
        </details>
        <a className="pz__abrir" href={enlaceCondiciones(p.marca, cond.version, cond.idioma)} target="_blank" rel="noopener noreferrer">{t.abrir} ↗</a>
      </section>

      <section className="pz__sec">
        {p.estado === 'aceptado' ? <p className="pz__hecho"><strong>{t.aceptadoTit}</strong>{t.aceptado(p.aceptado_nombre || '', fecha(p.aceptado_at!, true))}</p>
          : p.estado === 'anulado' ? <p className="pz__hecho">{t.anulado}</p>
          : d.caducado ? <p className="pz__hecho">{t.caducado}</p>
          : <FormAceptar token={p.token} idioma={p.idioma} nombre={lead?.nombre || ''} version={cond.version} />}
      </section>

      <p className="pz__pie">{t.dudas} <a href={`mailto:${CONTACTO[p.marca] || CONTACTO.custom}`}>{CONTACTO[p.marca] || CONTACTO.custom}</a></p>
    </Marco>
  )
}

// Todos los estados con datos inventados, sin tocar la base: /aceptar/demo?marca=arkevo|cartela|custom&estado=aceptado|anulado|caducado
// (&modo=dia para un treatment de The Pitch Lab).
// Solo en local; en producción, 404 como cualquier token que no existe.
async function demo(q: { estado?: string; modo?: string; marca?: string }) {
  if (process.env.NODE_ENV === 'production') return null
  const dia = q.modo === 'dia', marca = dia ? 'pitchlab' : ['cartela', 'custom'].includes(q.marca || '') ? q.marca! : 'arkevo'
  const texto = await readFile(`${process.cwd()}/condiciones/${marca}-v1.md`, 'utf8')
  const ej = DEMO[marca]
  const estado = q.estado === 'aceptado' || q.estado === 'anulado' ? q.estado : 'enviado'
  const p: Presupuesto = {
    id: 0, lead_id: 0, marca, token: 'demo', idioma: dia ? 'en' : 'es', modo: dia ? 'dia' : 'cerrado',
    concepto: ej.concepto, plan: ej.plan,
    precio: dia ? null : ej.precio, tarifa_dia: dia ? 450 : null, dias: dia ? 3 : null,
    incluye: ej.incluye, plazo: ej.plazo, caduca: q.estado === 'caducado' ? '2026-01-01' : '2026-12-31', condiciones_id: 0,
    estado, aceptado_at: estado === 'aceptado' ? new Date().toISOString() : null, aceptado_nombre: estado === 'aceptado' ? 'Marta Ruiz' : null,
    aceptado_email: null, aceptado_ip: null, aceptado_ua: null, condiciones_sha256: null, proyecto_id: null, created_at: new Date().toISOString(),
  }
  const cond = { id: 0, marca, version: 1, idioma: p.idioma, titulo: dia ? 'Terms of service' : 'Condiciones del servicio', texto, created_at: new Date().toISOString() }
  return { p, marca: ej.nombre, cond, lead: { nombre: 'Marta Ruiz', empresa: ej.empresa, email: '' }, caducado: q.estado === 'caducado' }
}
const DEMO: Record<string, { nombre: string; empresa: string; concepto: string; plan: string | null; precio: number | null; incluye: string; plazo: string }> = {
  arkevo: { nombre: 'Arkevo', empresa: 'Estudio Norte', concepto: 'Web Estudio Norte · diseño Lino', plan: 'Lino', precio: 1900, incluye: 'Diseño Lino adaptado a vuestra marca\nHasta 12 obras con su ficha\nEspañol e inglés\nDos rondas de cambios', plazo: '3 semanas desde que llega el material' },
  cartela: { nombre: 'Cartela', empresa: 'Bar Ripoll', concepto: 'Carta digital Bar Ripoll', plan: 'Casa', precio: 690, incluye: 'Carta completa: comida, bebidas y vinos\nHasta 4 idiomas\nHasta 30 fotos retocadas\nCambios ilimitados en 12 h durante un año', plazo: 'Primera versión en 48 h' },
  custom: { nombre: 'Custom Websites', empresa: 'Estudio Vela', concepto: 'Web Estudio Vela', plan: null, precio: 2400, incluye: 'Diseño a medida\n5 páginas\nAnimaciones con GSAP\nDos rondas de cambios', plazo: '4 semanas desde que llega el contenido' },
  pitchlab: { nombre: 'The Pitch Lab', empresa: 'Halden Films', concepto: 'Treatment · Halden spot', plan: null, precio: null, incluye: "Director's treatment, 12–16 pages\nPrivate link and PDF", plazo: '3–4 days from the brief' },
}
