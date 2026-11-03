import { readFile } from 'fs/promises'
import { presupuestoDeToken, enlaceCondiciones, type Presupuesto } from '@/lib/presupuestos'
import TextoCondiciones from '../../condiciones/texto'
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
    condiciones: 'Condiciones del servicio', leer: 'Leer aquí', abrir: 'Abrir en otra página',
    aceptado: (n: string, f: string) => `Aceptado por ${n} el ${f}. Gracias: te escribimos enseguida con los siguientes pasos.`,
    anulado: 'Este presupuesto ya no está vigente. Responde al email y te mandamos uno nuevo.',
    caducado: 'Este presupuesto ha caducado. Responde al email y te mandamos uno actualizado.',
    vacio: 'Enlace no válido',
  },
  en: {
    titulo: 'Quote', para: 'For', plan: 'Plan', precio: 'Price', tarifa: 'Day rate', dias: 'Estimated days', total: 'Estimated total',
    pagos: (a: string, b: string, cuando: string) => `50% to start (${a}) and 50% ${cuando} (${b}).`, entrega: 'Invoiced once on delivery, for the days worked.',
    cuando: { cartela: 'on delivery of the menu', otro: 'before launch' } as Record<string, string>,
    incluye: 'Includes', plazo: 'Timing', valido: 'Valid until', iva: 'Prices exclude VAT.', dia: '/day',
    condiciones: 'Terms of service', leer: 'Read here', abrir: 'Open in a new page',
    aceptado: (n: string, f: string) => `Accepted by ${n} on ${f}. Thank you: we will be in touch shortly with the next steps.`,
    anulado: 'This quote is no longer valid. Reply to the email and we will send you a new one.',
    caducado: 'This quote has expired. Reply to the email and we will send you an updated one.',
    vacio: 'Link not valid',
  },
}

// Página pública del presupuesto: el detalle, las condiciones con las que se envió y la casilla para aceptarlas.
// El token (presupuestos.token) es la única llave.
export default async function AceptarPage({ params, searchParams }: { params: { token: string }; searchParams: { estado?: string; modo?: string } }) {
  const d = params.token === 'demo' ? await demo(searchParams) : await presupuestoDeToken(params.token)
  if (!d) return <div className="app"><main className="publica publica--vacia"><p className="empty">Enlace no válido · Link not valid</p></main></div>
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
  const abierto = p.estado === 'enviado' && !d.caducado

  return (
    <div className="app">
      <main className="publica">
        <div className="col">
          <header className="page-header">
            <div className="page-header__txt">
              <p className="tags caps">{d.marca}</p>
              <h1 className="page-title">{p.concepto}</h1>
            </div>
          </header>

          <section className="block" style={{ gap: 18 }} aria-label={t.titulo}>
            <dl className="fx__kv">
              {filas.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {incluye.length > 0 && <><p className="caps">{t.incluye}</p><ul className="condiciones__lista">{incluye.map((l, i) => <li key={i}>{l}</li>)}</ul></>}
            <p className="nota">
              {p.modo === 'cerrado' ? t.pagos(eur(precio / 2), eur(precio / 2), t.cuando[p.marca] || t.cuando.otro) : t.entrega} {t.iva}
            </p>
          </section>

          <section className="block" style={{ gap: 12 }} aria-label={t.condiciones}>
            <p className="caps">{t.condiciones} · v{cond.version}</p>
            <details>
              <summary className="copy">{t.leer}</summary>
              <TextoCondiciones texto={cond.texto} />
            </details>
            <a href={enlaceCondiciones(p.marca, cond.version, cond.idioma)} target="_blank" rel="noopener noreferrer" className="copy">{t.abrir} ↗</a>
          </section>

          {p.estado === 'aceptado' ? <p className="nota ok" style={{ fontSize: 16 }}>{t.aceptado(p.aceptado_nombre || '', fecha(p.aceptado_at!, true))}</p>
            : p.estado === 'anulado' ? <p className="nota">{t.anulado}</p>
            : d.caducado ? <p className="nota">{t.caducado}</p>
            : null}
          {abierto && <FormAceptar token={p.token} idioma={p.idioma} nombre={lead?.nombre || ''} version={cond.version} />}
        </div>
      </main>
    </div>
  )
}

// Todos los estados con datos inventados, sin tocar la base: /aceptar/demo?estado=aceptado|anulado|caducado&modo=dia.
// Solo en local; en producción, 404 como cualquier token que no existe.
async function demo(q: { estado?: string; modo?: string }) {
  if (process.env.NODE_ENV === 'production') return null
  const dia = q.modo === 'dia', marca = dia ? 'pitchlab' : 'arkevo'
  const texto = await readFile(`${process.cwd()}/condiciones/${marca}-v1.md`, 'utf8')
  const estado = q.estado === 'aceptado' || q.estado === 'anulado' ? q.estado : 'enviado'
  const p: Presupuesto = {
    id: 0, lead_id: 0, marca, token: 'demo', idioma: dia ? 'en' : 'es', modo: dia ? 'dia' : 'cerrado',
    concepto: dia ? 'Treatment · Halden spot' : 'Web Estudio Norte · diseño Lino', plan: dia ? null : 'Lino',
    precio: dia ? null : 1900, tarifa_dia: dia ? 450 : null, dias: dia ? 3 : null,
    incluye: dia ? 'Director\'s treatment, 12–16 pages\nPrivate link and PDF' : 'Diseño Lino adaptado a vuestra marca\nHasta 12 obras con su ficha\nEspañol e inglés\nDos rondas de cambios',
    plazo: dia ? '3–4 days from the brief' : '3 semanas desde que llega el material', caduca: q.estado === 'caducado' ? '2026-01-01' : '2026-12-31', condiciones_id: 0,
    estado, aceptado_at: estado === 'aceptado' ? new Date().toISOString() : null, aceptado_nombre: estado === 'aceptado' ? 'Marta Ruiz' : null,
    aceptado_email: null, aceptado_ip: null, aceptado_ua: null, condiciones_sha256: null, proyecto_id: null, created_at: new Date().toISOString(),
  }
  const cond = { id: 0, marca, version: 1, idioma: p.idioma, titulo: dia ? 'Terms of service' : 'Condiciones del servicio', texto, created_at: new Date().toISOString() }
  return { p, marca: dia ? 'The Pitch Lab' : 'Arkevo', cond, lead: { nombre: 'Marta Ruiz', empresa: dia ? 'Halden Films' : 'Estudio Norte', email: '' }, caducado: q.estado === 'caducado' }
}
