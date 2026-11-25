import { pasoDeFase, PASOS_PORTAL, type Portal } from '@/lib/portal'
import { dinero } from '@/lib/moneda'
import Refrescar from './refrescar'

// El dashboard del cliente tras aceptar (decisión de Joel, 2026-11-25: dos pantallas, presupuesto y dashboard; solo
// lo esencial). Una columna: progreso, una tarjeta grande con lo que toca ahora y UN botón, y debajo lo que el
// cliente tiene pendiente y sus dos pagos. Las piezas no cambian de sitio: cambia su estado. Datos de
// src/lib/portal.ts; se refresca solo (router.refresh, sin recargar la página).
const T = {
  en: {
    pasos: { kickoff: 'Kick-off', material: 'Material', build: 'Build', review: 'Review', launch: 'Launch' } as Record<string, string>,
    paso: (n: number) => `Step ${n} of 5`, terminado: 'Completed',
    ahora: {
      factura: ['Quote accepted', 'Your first invoice is on its way. It will appear here.'],
      pago: ['Pay the first invoice to start', 'The project starts as soon as the payment comes in.'],
      confirmado: ['Payment received, thank you', "I'm getting the project ready."],
      material: ['Send me what is missing', 'I start building with whatever is there.'],
      comenzado: ['Building your site', 'Follow it as it grows in review mode.'],
      revision: ['Your turn to review', 'Leave your notes right on the site.'],
      entregado: ['Your site is live', ''],
      final: ['Your site is live', 'Only the final payment is left.'],
      cerrado: ['All done', 'Your site is live and fully paid. Thank you.'],
    } as Record<string, [string, string]>,
    verFactura: 'View invoice', abrirRevision: 'Open review mode', verWeb: 'Visit your site',
    comoPagar: 'How to pay', ref: (n: string) => `Reference: ${n}`,
    conectado: 'connected', pendienteDominio: 'connecting',
    tuyo: 'Your to-do', pagos: 'Payments', pago1: 'To start', pago2: 'At launch', pagada: 'Paid', porPagar: 'Due', proximamente: 'Not yet',
    presupuesto: 'Quote and terms', dudas: 'Questions?',
  },
  es: {
    pasos: { kickoff: 'Arranque', material: 'Material', build: 'Construcción', review: 'Revisión', launch: 'Lanzamiento' } as Record<string, string>,
    paso: (n: number) => `Paso ${n} de 5`, terminado: 'Terminado',
    ahora: {
      factura: ['Presupuesto aceptado', 'Tu primera factura está en camino. Aparecerá aquí.'],
      pago: ['Paga la primera factura para empezar', 'El proyecto empieza en cuanto llega el pago.'],
      confirmado: ['Pago recibido, gracias', 'Estoy preparando el proyecto.'],
      material: ['Mándame lo que falta', 'Empiezo a montar con lo que haya.'],
      comenzado: ['Construyendo tu web', 'Síguela mientras crece en el modo revisión.'],
      revision: ['Te toca revisar', 'Deja tus notas sobre la propia web.'],
      entregado: ['Tu web está publicada', ''],
      final: ['Tu web está publicada', 'Solo queda el pago final.'],
      cerrado: ['Terminado', 'Tu web está publicada y pagada. Gracias.'],
    } as Record<string, [string, string]>,
    verFactura: 'Ver la factura', abrirRevision: 'Abrir el modo revisión', verWeb: 'Ver tu web',
    comoPagar: 'Cómo pagar', ref: (n: string) => `Referencia: ${n}`,
    conectado: 'conectado', pendienteDominio: 'conectando',
    tuyo: 'Te toca', pagos: 'Pagos', pago1: 'Para empezar', pago2: 'Al publicar', pagada: 'Pagado', porPagar: 'Por pagar', proximamente: 'Aún no',
    presupuesto: 'Presupuesto y condiciones', dudas: '¿Dudas?',
  },
}

export default function Dashboard({ d, contacto, enlacePresupuesto }: { d: Portal; contacto: string; enlacePresupuesto: string }) {
  const { p, etapa, proyecto: pr, facturas } = d
  const t = T[p.idioma]
  const fase = pr?.fase ?? null
  const paso = pasoDeFase(fase, etapa)
  const din = (n: number) => dinero(n, p.moneda, p.idioma, n % 1 !== 0)

  const clave = etapa === 'factura' || etapa === 'pago' ? etapa : fase === 'cambios' ? 'revision' : fase || 'confirmado'
  // Lo que hay que pagar ahora: el primer pago antes de empezar y el final al publicar (no durante la obra).
  const debe = etapa !== 'proyecto' ? facturas.find(f => !f.cobrada) || null : null
  const [titulo, texto] = t.ahora[clave === 'entregado' && debe ? 'final' : clave] || t.ahora.confirmado
  const revision = etapa === 'proyecto' && paso >= 2 && paso <= 3 && pr?.url_revision ? pr.url_revision : null
  const web = etapa === 'lanzamiento' ? pr?.url_live || null : null

  // Un botón: pagar si hay algo por pagar; si no, el modo revisión o la web. Lo otro, como enlace pequeño.
  const boton = debe ? { href: debe.url, texto: t.verFactura } : revision ? { href: revision, texto: t.abrirRevision } : web ? { href: web, texto: t.verWeb } : null
  const secundario = web && boton?.href !== web ? { href: web, texto: t.verWeb } : null
  const abiertos = (pr?.pendientes || []).filter(x => !x.hecho)
  const mitad = p.modo === 'cerrado' && Number(p.precio) > 0 ? Number(p.precio) / 2 : null

  return (
    <div className="dz">
      <Refrescar />
      <h1 className="dz__titulo">{p.concepto}</h1>

      <section className="dz__progreso" aria-label={paso > 4 ? t.terminado : t.paso(paso + 1)}>
        <ol>
          {PASOS_PORTAL.map((k, i) => (
            <li key={k} className={i < paso ? 'is-hecho' : i === paso ? 'is-ahora' : undefined} aria-current={i === paso ? 'step' : undefined}>
              <span className="dz__seg" aria-hidden="true" />
              <span className="dz__paso">{t.pasos[k]}</span>
            </li>
          ))}
        </ol>
        <p className="dz__movil">{paso > 4 ? t.terminado : `${t.paso(paso + 1)} · ${t.pasos[PASOS_PORTAL[paso]]}`}</p>
      </section>

      <section className="dz__ahora" aria-live="polite">
        <h2>{titulo}</h2>
        {texto && <p className="pz__nota">{texto}</p>}
        {debe && <p className="dz__importe">{dinero(debe.total, debe.moneda, p.idioma, debe.total % 1 !== 0)}</p>}
        {etapa === 'lanzamiento' && pr?.dominio && (
          <p className="dz__dominio"><span className={`pz__punto${pr.dominio_estado === 'conectado' ? '' : ' is-espera'}`} aria-hidden="true" />{pr.dominio} · {pr.dominio_estado === 'conectado' ? t.conectado : t.pendienteDominio}</p>
        )}
        {(boton || secundario) && (
          <div className="dz__acciones">
            {boton && <a className="pz__btn pz__btn--link" href={boton.href} target="_blank" rel="noopener">{boton.texto} ↗</a>}
            {secundario && <a href={secundario.href} target="_blank" rel="noopener">{secundario.texto} ↗</a>}
          </div>
        )}
        {debe && d.pago && (
          <details className="dz__pago">
            <summary>{t.comoPagar}</summary>
            <pre>{d.pago}</pre>
            <p className="pz__nota">{t.ref(debe.numero)}</p>
          </details>
        )}
      </section>

      <div className="dz__fila">
        {abiertos.length > 0 && etapa !== 'lanzamiento' && (
          <section className="dz__card">
            <h3 className="pz__label">{t.tuyo}</h3>
            <ul className="pz__check">{abiertos.map((x, i) => <li key={i}><span className="pz__o" aria-hidden="true" /><span>{x.texto}</span></li>)}</ul>
          </section>
        )}
        <section className="dz__card">
          <h3 className="pz__label">{t.pagos}</h3>
          <ul className="dz__pagos">
            {([1, 2] as const).map(n => {
              const f = facturas.find(x => x.pago === n)
              const importe = f ? dinero(f.total, f.moneda, p.idioma, f.total % 1 !== 0) : mitad ? din(mitad) : ''
              return (
                <li key={n}>
                  <span>{n === 1 ? t.pago1 : t.pago2}</span>
                  <span className="dz__cifra">
                    {f ? <a href={f.url} target="_blank" rel="noopener">{importe}</a> : <span className="dz__apagado">{importe}</span>}
                    <span className={`pz__tag${f?.cobrada ? ' ok' : f ? ' aviso' : ''}`}>{f?.cobrada ? t.pagada : f ? t.porPagar : t.proximamente}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <p className="pz__pie dz__pie"><a href={enlacePresupuesto}>{t.presupuesto}</a><span>{t.dudas} <a href={`mailto:${contacto}`}>{contacto}</a></span></p>
    </div>
  )
}
