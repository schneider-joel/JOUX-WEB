'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ETIQUETA_FASE, type FaseProyecto } from '@/lib/leads'
import { ETAPAS_VISTA, NOMBRE_ENCARGO, entregaPendiente, PASO_ARKEVO_REVISION, alComenzar, antesDeComenzar, diasDesde, encargaAgente, estadoDe, estaParado, etapaVista, faltaBrief, nombreCorto, rondaSiguiente, type Estado, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { EMAIL_AL_ENTRAR, EMAIL_RECORDATORIO, NOMBRE_EMAIL } from '@/lib/emails'
import { ETIQUETA_PAGO, type Pago } from '@/lib/marcas'
import EmailPanel from '../../work/email-panel'
import AgenteWeb from '../../work/agente-web'
import BriefPanel from '../../work/brief'
import DriveCarpeta from '../../work/drive-carpeta'
import RefEntrega from '../../work/ref-entrega'
import Conversacion from './conversacion'
import Bienvenida from '../../leads/[id]/bienvenida'

export type MensajeHilo = { id: number; entrante: boolean; estado: string; asunto: string | null; cuerpo: string; error: string | null; plantilla: string | null; auto: boolean; deProyecto: boolean; de: string | null; para: string | null; adjuntos?: { nombre: string; url: string | null }[] }
export type ItemHilo = { tipo: 'msg'; clave: string; fecha: string; m: MensajeHilo } | { tipo: 'aviso'; clave: string; fecha: string; texto: string }
type Enlace = { titulo: string; url: string; estado: string; tono: 'ok' | 'aviso' | null; icono: 'gift' | 'pen' | 'chat' | 'folder' | 'globe' }
export type DatosFicha = {
  p: { id: number; nombre: string; cliente: string; marca: string | null; marcaNombre: string; cerrado: boolean; web: string | null; plan: string | null; status: string; prueba: boolean; fase: FaseProyecto | null; contacto: string | null; email: string | null; created_at: string }
  seg: ProyectoSeguimiento | null      // datos del seguimiento por etapa (null = proyecto sin seguimiento, p. ej. Ambushed/BoldMove)
  fases: FaseProyecto[]
  fechaFase: Partial<Record<FaseProyecto, string>>
  dinero: { tipo: 'cerrado'; precio: number; pagos: (Pago & { n: number; importe: number })[]; unica: (Pago & { importe: number }) | null }
    | { tipo: 'dias'; dias: number; base: number; facturas: { id: number; numero: string | null; fecha: string; importe: number; estado: string }[] }
  cliente: { identificador: string | null; direccion: string | null; pais: string | null } | null
  lead: { id: number; nombre: string | null; email: string; empresa: string | null; hilo: boolean } | null
  remitente: string | null
  enlaces: Enlace[]
  bienvenidaPendiente: boolean
  hilo: ItemHilo[]
  historial: { clave: number; tipo: string; fecha: string; texto: string; aviso: boolean }[]
}

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))} €`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).replace('.', '')
const PAIS: Record<string, string> = { ES: 'España · IVA 21 % y ret. 15 %', UE: 'Unión Europea · sin IVA', EXT: 'Fuera de la UE · sin IVA' }
const ESTADO_TS: Record<string, string> = { activo: 'Activo', completado: 'Completado', facturado: 'Facturado' }

// Lo que viene después de la etapa en la que está (rediseño comercial, fase 2): pasos genéricos por etapa,
// con quién los hace. Los de la etapa actual no se enseñan: lo que toca ya sale en la caja de arriba.
type Paso = { t: string; w: 'tú' | 'agente' | 'cliente' | 'banco' }
const proximos = (treatment: boolean, agente: boolean): Paso[][] => [
  treatment
    ? [{ t: 'Bienvenida', w: 'tú' }, { t: 'Material del cliente en Drive', w: 'cliente' }, { t: 'Dos direcciones del treatment', w: agente ? 'agente' : 'tú' }]
    : [{ t: 'Bienvenida y factura del 50 %', w: 'tú' }, { t: 'Cobro del 50 %', w: 'banco' }, { t: 'Primera versión', w: agente ? 'agente' : 'tú' }],
  [{ t: 'Enviar la R1 al cliente', w: 'tú' }, { t: 'Comentarios del cliente', w: 'cliente' }, { t: 'Aplicar los cambios', w: agente ? 'agente' : 'tú' }, { t: 'Aprobación', w: 'cliente' }],
  treatment
    ? [{ t: 'Entrega y factura de los días', w: 'tú' }, { t: 'Cobro', w: 'banco' }]
    : [{ t: 'Publicar y enviar la entrega con la factura final', w: 'tú' }, { t: 'Cobro del 50 % final', w: 'banco' }],
  [{ t: 'Cerrado', w: 'tú' }],
]
// Lo que cuenta como paso hecho en el recorrido (el resto del historial es ruido: estados del lead, borradores…).
const HECHOS = ['lead.ganado', 'proyecto.fase', 'factura.emitida', 'mensaje.enviado', 'datos.fiscales', 'drive.creada', 'brief.guardado', 'web.encargo', 'web.lista', 'web.error', 'material.completo', 'mensaje.rebotado']

// Lo que te toca en este proyecto, de más a menos urgente. La primera va en la caja grande; si es un email,
// el editor va dentro de la caja.
type Boton = { texto: string; href?: string; externo?: boolean; hacer?: () => void }
type Tarea = { titulo: string; sub?: string; email?: { clave: string; mensaje?: number }; panel?: 'brief' | 'agente' | 'drive' | 'aplicada' | 'entrega'; boton?: Boton; enlace?: Boton }

export default function Ficha({ d }: { d: DatosFicha }) {
  const router = useRouter()
  const { p, seg: s } = d
  const [chat, setChat] = useState(false)
  const [verEtapas, setVerEtapas] = useState(false)
  const [mover, setMover] = useState<FaseProyecto | null>(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [email, setEmail] = useState<{ clave: string; mensaje?: number } | null>(null)  // email elegido a mano (recordatorio, al cambiar de etapa)
  const [cerrada, setCerrada] = useState(false)  // «Ahora no» en el email de la caja
  const [verTodo, setVerTodo] = useState(false)
  const [verBrief, setVerBrief] = useState(false)
  const [aplicar, setAplicar] = useState<'pide' | 'guardando' | null>(null)  // «Ya he aplicado los cambios», con confirmación

  const fase = s?.fase ?? p.fase
  const idx = fase ? d.fases.indexOf(fase) : -1
  const etapa = etapaVista(fase)
  const treatment = d.dinero.tipo === 'dias'
  const pago1Cobrado = d.dinero.tipo === 'cerrado' && d.dinero.pagos[0]?.estado === 'cobrada'
  // Web entregada sin el email de entrega: la caja lo ofrece con la factura del pago 2 (la crea o, si ya se
  // facturó a mano, la adjunta).
  const conEntrega = !!s && d.dinero.tipo === 'cerrado' && !d.dinero.unica
  const pendienteEntrega = conEntrega && entregaPendiente(s!)
  const titulo = nombreCorto(p.nombre, p.cliente, p.marcaNombre)
  const ronda = s?.rondas.length ? s.rondas[s.rondas.length - 1] : null

  // Cambio de etapa: la misma llamada y las mismas reglas que antes (PATCH /api/proyectos/[id]/fase).
  const confirmar = async () => {
    if (!mover || !s) return
    setGuardando(true); setError('')
    const r = await fetch(`/api/proyectos/${p.id}/fase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fase: mover, ...(mover === 'comenzado' && nota.trim() ? { nota: nota.trim() } : {}) }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo guardar'); return }
    if (j?.encargo?.esperando_brief) { setVerBrief(true); setAviso('Comenzado. Escribe el brief de dirección y el agente empieza al guardarlo.') }
    else if (j?.encargo?.omitido && mover === 'comenzado') setAviso(`Comenzado, sin encargo: ${j.encargo.omitido}`)
    else setAviso('')
    // Al entregar una web con el pago 2 sin facturar, la caja ofrece la entrega con su factura (no el email suelto).
    const clave = mover === 'entregado' && conEntrega ? undefined : EMAIL_AL_ENTRAR[mover]
    setEmail(clave && s.plantillas.includes(clave) ? { clave } : null); setCerrada(false)
    setMover(null); setNota(''); setVerEtapas(false); router.refresh()
  }
  // «Ya he aplicado los cambios»: la ronda pasa a cerrada y sus emails sin enviar se descartan.
  const confirmarAplicada = async () => {
    if (!ronda) return
    setAplicar('guardando'); setError('')
    const r = await fetch(`/api/proyectos/${p.id}/ronda`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ronda: ronda.ronda }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    if (!r?.ok) { setAplicar('pide'); setError(j?.error || 'No se pudo guardar'); return }
    setAplicar(null); setEmail(null); router.refresh()
  }
  const pedirMover = (f: FaseProyecto) => { setError(''); setMover(f); setVerEtapas(true); setTimeout(() => document.getElementById('fx-etapas')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60) }

  const tareas: Tarea[] = []
  if (email) tareas.push({ titulo: `Envía «${NOMBRE_EMAIL[email.clave] || email.clave}»`, email })
  // Mismo orden que estadoDe() (la línea de la tarjeta en Work): cobro del pago 1, comentarios de la ronda, emails…
  if (s && antesDeComenzar(s) && (pago1Cobrado || s.material_completo) && !s.agente) tareas.push({ titulo: pago1Cobrado ? 'Pago 1 cobrado: comienza' : 'El cliente ya lo ha subido todo', sub: alComenzar(s), boton: { texto: 'Comenzar', hacer: () => pedirMover('comenzado') } })
  // Proyecto de prueba: no hay transferencia que esperar, así que se comienza a mano (crea el encargo del agente).
  if (s && p.prueba && fase === 'material' && !pago1Cobrado && !s.agente) tareas.push({ titulo: 'Prueba: comienza sin cobro', sub: alComenzar(s), boton: { texto: 'Comenzar (prueba)', hacer: () => pedirMover('comenzado') } })
  if (ronda?.estado === 'comentada') tareas.push({ titulo: `Aplica ${ronda.comentarios} comentario${ronda.comentarios === 1 ? '' : 's'} de ${ronda.ronda}`, panel: 'aplicada', boton: { texto: 'Ya he aplicado los cambios', hacer: () => { setError(''); setAplicar('pide') } }, enlace: ronda.url ? { texto: 'Ver la ronda', href: ronda.url, externo: true } : undefined })
  const siguiente = s ? rondaSiguiente(s) : null
  if (siguiente) tareas.push({ titulo: `Cambios aplicados: abre la ${siguiente} o entrega la web`, sub: PASO_ARKEVO_REVISION, boton: ronda?.url ? { texto: `Ver la ${ronda.ronda}`, href: ronda.url, externo: true } : undefined })
  if (pendienteEntrega) tareas.push({ titulo: 'Envía la entrega con la factura final', sub: `Factura del 50 % restante en PDF${p.marca === 'cartela' ? ' y el QR' : ''}, en la misma conversación con el cliente.`, panel: 'entrega' })
  if (d.bienvenidaPendiente && d.lead) tareas.push({ titulo: 'Envía la bienvenida al cliente', sub: d.dinero.tipo === 'cerrado' ? 'Con la factura del pago 1. Se envía desde la ficha del lead.' : 'Con la carpeta de Drive. Se envía desde la ficha del lead.', boton: { texto: 'Ir a la bienvenida', href: `/leads/${d.lead.id}` } })
  if (s) {
    // El borrador de «Entrega final» sin factura sobra si la entrega va a salir con ella.
    for (const b of s.borradores.filter(b => !(b.plantilla === 'entrega.final' && pendienteEntrega))) tareas.push({ titulo: `Revisa y envía «${NOMBRE_EMAIL[b.plantilla] || b.plantilla}»`, sub: b.error ? `No salió: ${b.error}` : undefined, email: { clave: b.plantilla, mensaje: b.id } })
    if (s.agente?.estado === 'error') tareas.push({ titulo: 'El agente no pudo terminar', sub: s.agente.motivo, panel: 'agente' })
    if (fase === 'comenzado' && s.encargo_tipo === 'custom' && !s.agente) tareas.push({ titulo: 'Escribe el brief de dirección', sub: 'El agente de custom empieza al guardarlo', panel: 'brief' })
    if (s.agente?.estado === 'lista' && fase === 'comenzado') tareas.push({ titulo: `Revisa la ${NOMBRE_ENCARGO[s.agente.tipo]} del agente`, sub: `Terminada el ${fecha(s.agente.fecha)}${s.agente.diseno ? ` · ${s.agente.diseno}` : ''}. ${s.agente.tipo === 'carta' ? 'El email de primera versión ya lleva la URL y el QR.' : 'Cuando esté bien, abre la R1 y pásalo a Revisión.'}`, boton: s.agente.url ? { texto: 'Ver', href: s.agente.url, externo: true } : undefined })
    if (s.drive_error && !s.drive_url) tareas.push({ titulo: 'No se pudo crear la carpeta de Drive', sub: s.drive_error, panel: 'drive' })
    const rec = fase ? EMAIL_RECORDATORIO[fase] : undefined
    if (estaParado(s) && rec && s.plantillas.includes(rec) && !s.borradores.some(b => b.plantilla === rec) && email?.clave !== rec) tareas.push({ titulo: `Lleva ${diasDesde(s.desde)} días en ${ETIQUETA_FASE[fase!]}`, sub: 'Puedes mandarle un recordatorio', boton: { texto: 'Preparar recordatorio', hacer: () => { setEmail({ clave: rec }); setCerrada(false) } } })
  }
  const toca = tareas[0]
  const estado: Estado = toca ? { k: 'tu', texto: toca.titulo } : s ? estadoDe(s, pago1Cobrado) : { k: 'espera', texto: `${ESTADO_TS[p.status] || p.status} · se lleva en su timesheet` }

  // Recorrido: lo hecho (del historial, en orden), lo de ahora y lo que viene.
  const hechos = d.historial.filter(h => HECHOS.includes(h.tipo) || h.tipo.startsWith('revision.')).reverse()
  const hechosVista = verTodo ? hechos : hechos.slice(-8)
  const viene = s ? proximos(treatment, !!s.encargo_tipo).slice(etapa + 1).flatMap((pasos, i) => pasos.map(x => ({ ...x, etapa: ETAPAS_VISTA[etapa + 1 + i] }))) : []

  const boton = (b: Boton, clase = 'pill pill--sm') => b.href
    ? (b.externo ? <a className={clase} href={b.href} target="_blank" rel="noreferrer">{b.texto} ↗</a> : <Link className={clase} href={b.href}>{b.texto}</Link>)
    : <button type="button" className={clase} onClick={b.hacer}>{b.texto}</button>
  const cuerpoTarea = (t: Tarea): ReactNode => {
    if (t.email && !cerrada) return <EmailPanel key={`${t.email.clave}-${t.email.mensaje ?? ''}`} proyectoId={p.id} clave={t.email.clave} mensajeId={t.email.mensaje} onCerrar={() => { setCerrada(true); setEmail(null) }} />
    if (t.email) return <button type="button" className="pill pill--sm" onClick={() => setCerrada(false)}>Abrir el email</button>
    if (t.panel === 'brief' && s) return <BriefPanel p={s} />
    if (t.panel === 'agente' && s) return <div className="fx__agente"><AgenteWeb p={s} /></div>
    if (t.panel === 'entrega') return <Bienvenida proyectoId={p.id} clave="entrega.final" abiertoDeEntrada />
    if (t.panel === 'drive' && s) return <DriveCarpeta proyectoId={p.id} url={s.drive_url} error={s.drive_error} />
    if (t.panel === 'aplicada' && aplicar) return (
      <div className="trk__mover fx__mover">
        <span>Se cierra la <b>{ronda?.ronda}</b> y se descartan sus emails sin enviar. Luego abres la siguiente ronda o entregas desde la herramienta de revisión.</span>
        {error && <span className="nota error">{error}</span>}
        <button type="button" className="copy caps" onClick={() => { setAplicar(null); setError('') }}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={aplicar === 'guardando'} onClick={confirmarAplicada}>{aplicar === 'guardando' ? 'Guardando…' : 'Confirmar'}</button>
      </div>
    )
    if (t.boton && t.enlace) return <div className="fx__btns">{boton(t.boton)}{boton(t.enlace, 'copy caps')}</div>
    return t.boton ? <div>{boton(t.boton)}</div> : null
  }

  return (
    <main className="main fx">
      <header className="fx__top">
        <div className="fx__tit">
          <h1>{titulo}</h1>
          <div className="fx__facts">
            <span>{p.marcaNombre}</span>
            {p.plan && <><span aria-hidden="true">·</span><span>{p.plan}</span></>}
            {d.dinero.tipo === 'cerrado' && d.dinero.precio > 0 && <><span aria-hidden="true">·</span><span className="num">{eur(d.dinero.precio)}</span></>}
            <span aria-hidden="true">·</span><span>{p.contacto || p.cliente}</span>
            {p.prueba && <span className="fx__tag aviso">Prueba · sin validez fiscal</span>}
          </div>
        </div>
        <div className="fx__acts">
          {d.lead && <Link className="ghost" href={`/leads/${d.lead.id}`}>Lead</Link>}
          <button type="button" className="ghost" onClick={() => setChat(true)} aria-expanded={chat} aria-controls="fx-chat">Conversación</button>
        </div>
      </header>

      {/* Etapa: 4 tramos. Las 7 fases de la base quedan plegadas en «Cambiar etapa» para moverlas a mano. */}
      {s && (
        <section className="fx__etapa" id="fx-etapas" aria-label="Etapa">
          <div className="wk__etapas fx__barra" style={{ ['--n' as string]: ETAPAS_VISTA.length }}>
            <span className="wk__barra" aria-hidden="true">{ETAPAS_VISTA.map((e, i) => <i key={e} className={fase === 'cerrado' || i < etapa ? 'is-hecho' : i === etapa ? 'is-ahora' : ''} />)}</span>
            <span className="wk__etiqueta">{ETAPAS_VISTA.map((e, i) => <span key={e} className={i === etapa ? 'is-ahora' : ''}>{e}</span>)}</span>
          </div>
          <button type="button" className="copy caps fx__cambiar" aria-expanded={verEtapas} onClick={() => { setVerEtapas(!verEtapas); setMover(null) }}>{verEtapas ? 'Cerrar' : 'Cambiar etapa'}</button>
          {verEtapas && (
            <div className="fx__mover7">
              <ol className="fx__steps" style={{ ['--n' as string]: d.fases.length }}>
                {d.fases.map((f, i) => {
                  const e = i < idx ? 'd' : i === idx ? 'c' : ''
                  return (
                    <li key={f} className={`fx__st${e ? ` is-${e}` : ''}${mover === f ? ' is-elegido' : ''}`}>
                      <button type="button" onClick={() => { setError(''); setMover(i === idx || mover === f ? null : f) }} aria-label={i === idx ? `Fase actual: ${ETIQUETA_FASE[f]}` : `Mover a ${ETIQUETA_FASE[f]}`}>
                        <span className="fx__dotw"><span className="fx__dot">{e === 'd' && '✓'}</span><span className="fx__ln" /></span>
                        <span className="fx__nm">{ETIQUETA_FASE[f]}</span>
                        <span className="fx__dt">{d.fechaFase[f] ? fecha(d.fechaFase[f]!) : i === idx ? 'ahora' : '—'}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
              {mover && (
                <div className="trk__mover fx__mover">
                  <span>Mover a <b>{ETIQUETA_FASE[mover]}</b>{fase ? <> desde {ETIQUETA_FASE[fase]}</> : null}{mover === 'comenzado' && <> · {alComenzar(s)}</>}</span>
                  {encargaAgente(s, mover) && !(s.encargo_tipo === 'custom' && faltaBrief(s.brief)) && (
                    <div className="field trk__nota">
                      <label className="caps" htmlFor="fx-nota">Nota para el agente (opcional)</label>
                      <input id="fx-nota" value={nota} onChange={e => setNota(e.target.value)} maxLength={1000} placeholder={s.encargo_tipo === 'treatment' ? 'p. ej. que la dirección B sea más oscura' : 'p. ej. sin página de equipo'} />
                    </div>
                  )}
                  {error && <span className="nota error">{error}</span>}
                  <button type="button" className="copy caps" onClick={() => { setMover(null); setNota('') }}>Cancelar</button>
                  <button type="button" className="pill pill--sm" disabled={guardando} onClick={confirmar}>{guardando ? 'Guardando…' : 'Mover'}</button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Lo único que pide atención: lo que te toca (con su email o su botón) o a qué se espera. */}
      <section className={`fx__caja is-${estado.k}`} aria-label="Ahora">
        <span className="caps">{estado.k === 'tu' ? 'Te toca' : estado.k === 'parado' ? 'Parado' : estado.k === 'ok' ? 'Terminado' : 'Esperando'}</span>
        <h2>{estado.texto}</h2>
        {toca?.sub && <p className="fx__sub">{toca.sub}</p>}
        {toca && cuerpoTarea(toca)}
        {!toca && s?.agente && s.agente.estado !== 'error' && <div className="fx__agente"><AgenteWeb p={s} /></div>}
        {tareas.length > 1 && (
          <ul className="fx__mas">
            {tareas.slice(1).map((t, i) => (
              <li key={i}><i aria-hidden="true" /><span><b>{t.titulo}</b>{t.sub && <span> · {t.sub}</span>}</span>
                {t.email ? <button type="button" className="copy caps" onClick={() => { setEmail(t.email!); setCerrada(false) }}>Abrir →</button> : t.boton && boton(t.boton, 'copy caps')}
                {t.panel === 'aplicada' && aplicar && cuerpoTarea(t)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {aviso && <p className="nota">{aviso}</p>}

      <div className="fx__grid">
        <section className="fx__card" aria-labelledby="fx-rec">
          <header><h2 id="fx-rec">Recorrido</h2><span className="caps dim">Desde el {fecha(p.created_at)}</span></header>
          <ol className="fx__rec">
            {hechos.length > hechosVista.length && <li className="fx__rmas"><button type="button" className="copy caps" onClick={() => setVerTodo(true)}>Ver los {hechos.length - hechosVista.length} anteriores</button></li>}
            {hechosVista.map(h => <li key={h.clave} className={`is-hecho${h.aviso ? ' is-aviso' : ''}`}><span className="fx__o" aria-hidden="true">✓</span><span>{h.texto}</span><span className="caps dim">{fecha(h.fecha)}</span></li>)}
            <li className={`is-ahora is-${estado.k}`}><span className="fx__o" aria-hidden="true" /><span><b>{estado.texto}</b></span><span className="caps">ahora</span></li>
            {viene.map((x, i) => (
              <li key={i} className="is-viene">{(i === 0 || viene[i - 1].etapa !== x.etapa) && <span className="fx__ret caps">{x.etapa}</span>}
                <span className="fx__o" aria-hidden="true" /><span>{x.t}</span><span className="caps dim">{x.w}</span></li>
            ))}
          </ol>
        </section>

        <aside className="fx__col">
          <section className="fx__card" aria-labelledby="fx-di">
            <header><h2 id="fx-di">Dinero</h2><span className="caps dim">Base sin IVA</span></header>
            {d.dinero.tipo === 'cerrado' ? (
              <table className="fx__tbl"><tbody>
                {d.dinero.unica ? (
                  <tr><td>Factura única{d.dinero.unica.numero ? ` · ${d.dinero.unica.numero}` : ''}</td><td><EstadoPago x={d.dinero.unica} /></td></tr>
                ) : d.dinero.pagos.map(x => (
                  <tr key={x.n}>
                    <td>{ETIQUETA_PAGO[x.n - 1]}{x.facturaId ? <> · <a href={`/invoice/${x.facturaId}`} target="_blank" rel="noreferrer">{x.numero}</a></> : null}<small className="dim"> · {eur(x.importe)}</small></td>
                    <td><EstadoPago x={x} /></td>
                  </tr>
                ))}
              </tbody></table>
            ) : (
              <table className="fx__tbl"><tbody>
                <tr><td>Días trabajados</td><td className="num">{d.dinero.dias} · {eur(d.dinero.base)}</td></tr>
                {d.dinero.facturas.map(f => <tr key={f.id}><td><a href={`/invoice/${f.id}`} target="_blank" rel="noreferrer">{f.numero || 'Factura'}</a><small className="dim"> · {eur(f.importe)}</small></td><td><span className={`fx__tag${f.estado === 'cobrada' ? ' ok' : ''}`}>{f.estado === 'cobrada' ? 'Cobrada' : 'Pendiente'}</span></td></tr>)}
              </tbody></table>
            )}
            {p.marca && <Link href={`/work/${p.marca}`} className="copy caps">{d.dinero.tipo === 'cerrado' ? 'Facturar en' : 'Timesheet de'} {p.marcaNombre} →</Link>}
          </section>

          <section className="fx__card" aria-labelledby="fx-en">
            <header><h2 id="fx-en">Enlaces</h2></header>
            {d.enlaces.length > 0 && (
              <ul className="fx__links">
                {d.enlaces.map(e => <li key={e.titulo}><a href={e.url} target="_blank" rel="noreferrer"><span>{e.titulo} ↗</span><span className={`fx__tag${e.tono ? ` ${e.tono}` : ''}`}>{e.estado}</span></a></li>)}
              </ul>
            )}
            {s && <RefEntrega proyectoId={p.id} valor={s.ref_entrega} />}
            {s?.encargo_tipo === 'custom' && toca?.panel !== 'brief' && (verBrief ? <BriefPanel p={s} /> : <button type="button" className="copy caps" onClick={() => setVerBrief(true)}>{s.brief ? 'Ver el brief de dirección' : 'Escribir el brief de dirección'} →</button>)}
            {s && (s.material || (s.agente?.estado === 'lista' && s.agente.notas.length > 0)) && (
              <details className="fx__notas"><summary className="copy caps">Notas del agente y material</summary><div className="fx__agente"><AgenteWeb p={s} detalle /></div></details>
            )}
          </section>

          <section className="fx__card" aria-labelledby="fx-cl">
            <header><h2 id="fx-cl">Cliente</h2></header>
            <dl className="fx__kv">
              <dt>Cliente fiscal</dt><dd>{p.cliente}</dd>
              {d.cliente?.identificador && <><dt>NIF</dt><dd className="num">{d.cliente.identificador}</dd></>}
              <dt>País</dt><dd>{d.cliente?.pais ? PAIS[d.cliente.pais] || d.cliente.pais : <span className="aviso">Sin datos fiscales</span>}</dd>
              {p.contacto && <><dt>Contacto</dt><dd>{p.contacto}</dd></>}
              {p.email && <><dt>Email</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd></>}
            </dl>
          </section>
        </aside>
      </div>

      <Conversacion abierta={chat} onCerrar={() => setChat(false)} onEmail={(clave, mensaje) => { setChat(false); setEmail({ clave, mensaje }); setCerrada(false) }} c={{
        nombre: p.contacto || p.cliente, email: p.email, remitente: d.remitente, leadId: d.lead?.id ?? null, hilo: d.hilo,
        enviarA: d.lead ? `/api/proyectos/${p.id}/mensaje` : null,
        sinEscribir: d.lead ? 'Esta marca no tiene remitente de Gmail.' : 'Este proyecto no viene de un lead: escríbele desde Gmail.',
      }} />
    </main>
  )
}

function EstadoPago({ x }: { x: Pago }) {
  return <span className={`fx__tag${x.estado === 'cobrada' ? ' ok' : x.estado === 'pendiente' ? ' aviso' : ''}`}>{x.estado === 'cobrada' ? 'Cobrado' : x.estado === 'pendiente' ? 'Facturado' : 'Sin facturar'}</span>
}
