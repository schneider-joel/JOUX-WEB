import type { ReactNode } from 'react'
import { pasoDeFase, PASOS_PORTAL, type FacturaPortal, type Portal } from '@/lib/portal'
import { dinero } from '@/lib/moneda'
import Refrescar from './refrescar'

// El dashboard del cliente tras aceptar (decisión de Joel, 2026-11-25: dos pantallas, presupuesto y dashboard).
// Siempre las mismas tarjetas en el mismo sitio; lo que cambia es su estado: la factura pasa de «En preparación» a
// «Por pagar» y a «Pagada», el modo revisión y la web se desbloquean, los pendientes se tachan. Nada desaparece ni
// se reordena. Datos de src/lib/portal.ts; se refresca solo (router.refresh, sin recargar la página).
const T = {
  en: {
    proyecto: 'Project', presupuesto: 'Quote and terms', estado: { factura: 'Getting started', pago: 'Awaiting first payment', proyecto: 'In progress', lanzamiento: 'Live', cerrado: 'Completed' },
    paso: (n: number) => `Step ${n} of 5`,
    pasos: { kickoff: 'Kick-off', material: 'Material', build: 'Build', review: 'Review', launch: 'Launch' } as Record<string, string>,
    ahora: 'Now',
    siguiente: {
      factura: ['Quote accepted', "I'm preparing your first invoice. It will appear here, with how to pay it."],
      pago: ['Your first invoice is ready', 'The project officially starts as soon as the first payment comes in.'],
      confirmado: ['Getting everything ready', 'Payment received, thank you. I am setting up the project.'],
      material: ['Material', 'Send me what is still on the list below. I start building with whatever is there.'],
      comenzado: ['Building your site', 'You can follow it as it grows in review mode.'],
      revision: ['Your turn: review', 'Leave your notes right on the site in review mode. I make the changes.'],
      entregado: ['Your site is live', 'The final invoice is below.'],
      cerrado: ['All done', 'Thank you. Your site is live and fully paid.'],
    } as Record<string, [string, string]>,
    verFactura: 'View invoice', abrirRevision: 'Open review mode', verWeb: 'Visit the site',
    facturas: 'Invoices', pago1: 'First payment', pago2: 'Final payment', preparando: 'Preparing', alLanzar: 'At launch', porPagar: 'To pay', pagada: 'Paid', vence: 'Due',
    comoPagar: 'How to pay', ref: (n: string) => `Use ${n} as the reference.`,
    tuyo: 'What I need from you', nada: 'Nothing pending on your side.', sinLista: 'I will add here anything I need from you.',
    revision: 'Review mode', revisionTxt: 'Your private link to the site in progress. Click anything and leave a note.', revisionBloq: 'Opens once the build starts.', revisionCerrada: 'Closed: your site is live.',
    web: 'Your site', dominio: 'Domain', conectado: 'Connected', pendiente: 'Not connected yet', webBloq: 'Goes live at launch.',
    total: 'Total', plazo: 'Timing', aceptado: 'Accepted',
    dudas: 'Questions? Write to',
  },
  es: {
    proyecto: 'Proyecto', presupuesto: 'Presupuesto y condiciones', estado: { factura: 'Empezando', pago: 'Esperando el primer pago', proyecto: 'En marcha', lanzamiento: 'Publicada', cerrado: 'Terminado' },
    paso: (n: number) => `Paso ${n} de 5`,
    pasos: { kickoff: 'Arranque', material: 'Material', build: 'Construcción', review: 'Revisión', launch: 'Lanzamiento' } as Record<string, string>,
    ahora: 'Ahora',
    siguiente: {
      factura: ['Presupuesto aceptado', 'Estoy preparando tu primera factura. Aparecerá aquí, con cómo pagarla.'],
      pago: ['Tu primera factura está lista', 'El proyecto empieza oficialmente en cuanto llega el primer pago.'],
      confirmado: ['Preparándolo todo', 'Pago recibido, gracias. Estoy preparando el proyecto.'],
      material: ['Material', 'Mándame lo que queda en la lista de abajo. Empiezo a montar con lo que haya.'],
      comenzado: ['Construyendo tu web', 'Puedes seguirla mientras crece en el modo revisión.'],
      revision: ['Te toca revisar', 'Deja tus notas sobre la propia web en el modo revisión. Yo hago los cambios.'],
      entregado: ['Tu web está publicada', 'Abajo tienes la factura final.'],
      cerrado: ['Terminado', 'Gracias. Tu web está publicada y pagada.'],
    } as Record<string, [string, string]>,
    verFactura: 'Ver la factura', abrirRevision: 'Abrir el modo revisión', verWeb: 'Ver la web',
    facturas: 'Facturas', pago1: 'Primer pago', pago2: 'Pago final', preparando: 'En preparación', alLanzar: 'Al publicar', porPagar: 'Por pagar', pagada: 'Pagada', vence: 'Vence',
    comoPagar: 'Cómo pagar', ref: (n: string) => `Pon ${n} como referencia.`,
    tuyo: 'Lo que necesito de ti', nada: 'Nada pendiente por tu parte.', sinLista: 'Aquí iré poniendo lo que necesite de ti.',
    revision: 'Modo revisión', revisionTxt: 'Tu enlace privado a la web en construcción. Pulsa en cualquier cosa y deja una nota.', revisionBloq: 'Se abre cuando empiece la construcción.', revisionCerrada: 'Cerrado: tu web ya está publicada.',
    web: 'Tu web', dominio: 'Dominio', conectado: 'Conectado', pendiente: 'Pendiente de conectar', webBloq: 'Se publica en el lanzamiento.',
    total: 'Total', plazo: 'Plazo', aceptado: 'Aceptado',
    dudas: '¿Dudas? Escríbeme a',
  },
}

export default function Dashboard({ d, contacto, enlacePresupuesto }: { d: Portal; contacto: string; enlacePresupuesto: string }) {
  const { p, etapa, proyecto: pr, facturas } = d
  const en = p.idioma === 'en'
  const t = T[p.idioma]
  const fase = pr?.fase ?? null
  const paso = pasoDeFase(fase, etapa)
  const quien = d.lead?.empresa || d.lead?.nombre || ''
  const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(en ? (p.moneda === 'USD' ? 'en-US' : 'en-GB') : 'es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })

  // Lo que pasa ahora: por etapa antes del primer pago; después, por la fase del proyecto.
  const clave = etapa === 'factura' || etapa === 'pago' ? etapa : fase === 'cambios' ? 'revision' : fase || 'confirmado'
  const [titulo, texto] = t.siguiente[clave] || t.siguiente.confirmado
  const estado = fase === 'cerrado' ? t.estado.cerrado : t.estado[etapa as keyof typeof t.estado]
  const pendienteFactura = facturas.find(f => !f.cobrada)
  const revisionAbierta = etapa === 'proyecto' && paso >= 2 && !!pr?.url_revision
  const accion = pendienteFactura && (etapa === 'pago' || etapa === 'lanzamiento') ? { href: pendienteFactura.url, texto: t.verFactura }
    : revisionAbierta ? { href: pr!.url_revision!, texto: t.abrirRevision }
    : etapa === 'lanzamiento' && pr?.url_live ? { href: pr.url_live, texto: t.verWeb } : null

  // Las dos facturas siempre tienen su hueco; sin emitir, el importe previsto.
  const mitad = p.modo === 'cerrado' && Number(p.precio) > 0 ? Number(p.precio) / 2 : null
  const hueco = (n: 1 | 2) => ({ n, f: facturas.find(f => f.pago === n) || null })
  const pend = pr?.pendientes || []
  const hechos = pend.filter(x => x.hecho).length

  return (
    <div className="dz">
      <Refrescar />
      <header className="dz__cab">
        <div>
          <span className="pz__label">{t.proyecto}{quien ? ` · ${quien}` : ''}</span>
          <h1>{p.concepto}</h1>
        </div>
        <div className="dz__cab-der">
          <span className="dz__pill"><span className="pz__punto" aria-hidden="true" />{estado}</span>
          <a href={enlacePresupuesto}>{t.presupuesto} →</a>
        </div>
      </header>

      <section className="dz__card dz__progreso" aria-label={t.paso(Math.min(paso, 4) + 1)}>
        <div className="dz__barra" aria-hidden="true"><span style={{ width: `${Math.min(paso, 4) / 4 * 100}%` }} /></div>
        <ol>
          {PASOS_PORTAL.map((k, i) => (
            <li key={k} className={i < paso ? 'is-hecho' : i === paso ? 'is-ahora' : undefined} aria-current={i === paso ? 'step' : undefined}>
              <span className="pz__o" aria-hidden="true">{i < paso ? '✓' : ''}</span>
              <span className="dz__paso">{t.pasos[k]}</span>
            </li>
          ))}
        </ol>
        <p className="dz__movil">{paso > 4 ? t.estado.cerrado : `${t.paso(paso + 1)} · ${t.pasos[PASOS_PORTAL[paso]]}`}</p>
      </section>

      <div className="dz__grid">
        <section className="dz__card dz__ahora">
          <span className="pz__label">{t.ahora}</span>
          <h2>{titulo}</h2>
          <p className="pz__nota">{texto}</p>
          {accion && <a className="pz__btn pz__btn--link" href={accion.href} target="_blank" rel="noopener">{accion.texto} ↗</a>}
          <dl className="dz__datos">
            {p.modo === 'cerrado' && Number(p.precio) > 0 && <div><dt>{t.total}</dt><dd>{dinero(Number(p.precio), p.moneda, p.idioma)}</dd></div>}
            {p.plazo && <div><dt>{t.plazo}</dt><dd>{p.plazo}</dd></div>}
            {p.aceptado_at && <div><dt>{t.aceptado}</dt><dd>{fecha(p.aceptado_at.slice(0, 10))}</dd></div>}
          </dl>
        </section>

        <section className="dz__card">
          <span className="pz__label">{t.facturas}</span>
          <ul className="dz__facturas">
            {[hueco(1), hueco(2)].map(({ n, f }) => (
              <li key={n}>
                <span><b>{n === 1 ? t.pago1 : t.pago2}</b><small>{f ? `${f.numero}${!f.cobrada && f.vence ? ` · ${t.vence} ${fecha(f.vence)}` : ''}` : n === 1 ? t.preparando : t.alLanzar}</small></span>
                <span className="dz__cifra">
                  {f ? dinero(f.total, f.moneda, p.idioma, true) : mitad ? dinero(mitad, p.moneda, p.idioma, true) : ''}
                  <Estado f={f} t={t} />
                </span>
                {f && <a href={f.url} target="_blank" rel="noopener">{t.verFactura} ↗</a>}
              </li>
            ))}
          </ul>
          {pendienteFactura && d.pago && (
            <details className="dz__pago" open={etapa === 'pago'}>
              <summary>{t.comoPagar}</summary>
              <pre>{d.pago}</pre>
              <p className="pz__nota">{t.ref(pendienteFactura.numero)}</p>
            </details>
          )}
        </section>

        <section className="dz__card">
          <span className="pz__label">{t.tuyo}{pend.length > 0 && <span className="dz__cuenta">{hechos}/{pend.length}</span>}</span>
          {pend.length > 0 ? (
            <ul className="pz__check">{pend.map((x, i) => <li key={i} className={x.hecho ? 'is-hecho' : undefined}><span className="pz__o" aria-hidden="true">{x.hecho ? '✓' : ''}</span><span>{x.texto}</span></li>)}</ul>
          ) : <p className="pz__nota">{t.sinLista}</p>}
          {pend.length > 0 && hechos === pend.length && <p className="pz__nota" style={{ marginTop: 10 }}>{t.nada}</p>}
        </section>

        <Tarjeta titulo={t.revision} bloqueada={!revisionAbierta} motivo={paso > 3 ? t.revisionCerrada : t.revisionBloq}>
          {revisionAbierta ? <>
            <p className="pz__nota">{t.revisionTxt}</p>
            <a className="dz__enlace" href={pr!.url_revision!} target="_blank" rel="noopener">{t.abrirRevision} ↗</a>
          </> : null}
        </Tarjeta>

        <Tarjeta titulo={t.web} bloqueada={etapa !== 'lanzamiento' && !pr?.dominio} motivo={t.webBloq}>
          {etapa === 'lanzamiento' && pr?.url_live && <a className="dz__enlace dz__enlace--grande" href={pr.url_live} target="_blank" rel="noopener">{pr.url_live.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>}
          {pr?.dominio && (
            <dl className="dz__kv">
              <dt>{t.dominio}</dt>
              <dd>{pr.dominio} <span className={`pz__tag${pr.dominio_estado === 'conectado' ? ' ok' : ''}`}>{pr.dominio_estado === 'conectado' ? t.conectado : t.pendiente}</span></dd>
            </dl>
          )}
          {etapa !== 'lanzamiento' && pr?.dominio && <p className="pz__nota">{t.webBloq}</p>}
        </Tarjeta>
      </div>

      <p className="pz__pie">{t.dudas} <a href={`mailto:${contacto}`}>{contacto}</a></p>
    </div>
  )
}

function Estado({ f, t }: { f: FacturaPortal | null; t: typeof T.en | typeof T.es }) {
  if (!f) return null
  return <span className={`pz__tag${f.cobrada ? ' ok' : ' aviso'}`}>{f.cobrada ? t.pagada : t.porPagar}</span>
}

// Una tarjeta que aún no toca: se ve (el cliente sabe que llegará) pero apagada, con cuándo se abre.
function Tarjeta({ titulo, bloqueada, motivo, children }: { titulo: string; bloqueada: boolean; motivo: string | null; children: ReactNode }) {
  return (
    <section className={`dz__card${bloqueada && !children ? ' is-bloq' : ''}`}>
      <span className="pz__label">{titulo}</span>
      {children || (motivo && <p className="pz__nota">{motivo}</p>)}
    </section>
  )
}
