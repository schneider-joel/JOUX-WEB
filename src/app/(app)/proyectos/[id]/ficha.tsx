'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ETIQUETA_FASE, type FaseProyecto } from '@/lib/leads'
import { AHORA, DIAS_ALERTA, NOMBRE_ENCARGO, alComenzar, antesDeComenzar, diasDesde, encargaAgente, faltaBrief, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { EMAIL_AL_ENTRAR, EMAIL_RECORDATORIO, NOMBRE_EMAIL } from '@/lib/emails'
import { SUBCARPETAS } from '@/lib/drive-carpetas'
import { ETIQUETA_PAGO, type Pago } from '@/lib/marcas'
import EmailPanel from '../../work/email-panel'
import AgenteWeb from '../../work/agente-web'
import BriefPanel from '../../work/brief'
import DriveCarpeta from '../../work/drive-carpeta'
import RefEntrega from '../../work/ref-entrega'
import Conversacion, { iniciales } from './conversacion'

export type MensajeHilo = { id: number; entrante: boolean; estado: string; asunto: string | null; cuerpo: string; error: string | null; plantilla: string | null; auto: boolean; deProyecto: boolean; de: string | null; para: string | null }
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
  historial: { clave: number; fecha: string; texto: string; aviso: boolean }[]
}

const agrupar = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions
const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, ...agrupar }).format(Math.round(n))} €`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).replace('.', '')
const dias = (n: number) => n === 0 ? 'hoy' : n === 1 ? '1 día' : `${n} días`
const ESTADO_TS: Record<string, string> = { activo: 'Activo', completado: 'Completado', facturado: 'Facturado' }
const PAIS: Record<string, string> = { ES: 'España · IVA 21 % y ret. 15 %', UE: 'Unión Europea · sin IVA', EXT: 'Fuera de la UE · sin IVA' }

const svg = { className: 'sh__i', viewBox: '0 0 24 24', 'aria-hidden': true } as const
const I = {
  flag: <svg {...svg}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  euro: <svg {...svg}><path d="M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9" /></svg>,
  cal: <svg {...svg}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  users: <svg {...svg}><circle cx="9" cy="9" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6M18 19a5 5 0 0 0-3-4.6" /></svg>,
  chat: <svg {...svg}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  folder: <svg {...svg}><path d="M3 7h6l2 2h10v10H3z" /></svg>,
  link: <svg {...svg}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>,
  clock: <svg {...svg}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>,
  bot: <svg {...svg}><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></svg>,
  eye: <svg {...svg}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  check: <svg {...svg}><path d="M5 12l5 5 9-10" /></svg>,
  gift: <svg {...svg}><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M12 9v11M4 13h16M12 9c-3 0-5-1.5-5-3s3-1 5 3c2-4 5-4.5 5-3s-2 3-5 3" /></svg>,
  globe: <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>,
  pen: <svg {...svg}><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg>,
  doc: <svg {...svg}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>,
}

// Lo que te toca ahora en este proyecto: lo más urgente primero, con su botón.
type Tarea = { texto: string; sub?: string; accion?: { texto: string; href?: string; hacer?: () => void } }

export default function Ficha({ d }: { d: DatosFicha }) {
  const router = useRouter()
  const { p, seg: s } = d
  const [chat, setChat] = useState(false)
  const [mover, setMover] = useState<FaseProyecto | null>(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [email, setEmail] = useState<{ clave: string; mensaje?: number } | null>(null)
  const [verBrief, setVerBrief] = useState(false)

  const fase = s?.fase ?? p.fase
  const idx = fase ? d.fases.indexOf(fase) : -1
  const enFase = s ? diasDesde(s.desde) : 0
  const parado = !!fase && DIAS_ALERTA[fase] != null && enFase >= DIAS_ALERTA[fase]!
  const siguiente = idx >= 0 && idx < d.fases.length - 1 ? d.fases[idx + 1] : !fase ? d.fases[0] : null
  const borradoresLead = d.hilo.filter((x): x is Extract<ItemHilo, { tipo: 'msg' }> => x.tipo === 'msg' && !x.m.entrante && !x.m.deProyecto && (x.m.estado === 'borrador' || x.m.estado === 'error'))
  const porAprobar = (s?.borradores.length || 0) + borradoresLead.length
  const ultimoEntrante = [...d.hilo].reverse().find(x => x.tipo === 'msg' && x.m.entrante)
  const abrirEmail = (clave: string, mensaje?: number) => { setChat(false); setEmail({ clave, mensaje }); setTimeout(() => document.getElementById('fx-email')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60) }

  // Cambio de etapa: la misma llamada y las mismas reglas que en Work › Proyectos.
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
    const clave = EMAIL_AL_ENTRAR[mover]
    setEmail(clave && s.plantillas.includes(clave) ? { clave } : null)
    setMover(null); setNota(''); router.refresh()
  }

  const tareas: Tarea[] = []
  if (d.bienvenidaPendiente && d.lead) tareas.push({ texto: 'Envía la bienvenida al cliente', sub: 'Con la carpeta de Drive y, en las webs, la factura del pago 1', accion: { texto: 'Ir al lead', href: `/leads/${d.lead.id}` } })
  if (s) {
    for (const b of s.borradores) tareas.push({ texto: `Revisa y envía «${NOMBRE_EMAIL[b.plantilla] || b.plantilla}»`, sub: b.error ? `No salió: ${b.error}` : 'Borrador preparado para el cliente', accion: { texto: 'Revisar email', hacer: () => abrirEmail(b.plantilla, b.id) } })
    if (s.agente?.estado === 'lista' && fase === 'comenzado') tareas.push({ texto: `Revisa la ${NOMBRE_ENCARGO[s.agente.tipo]} del agente`, sub: `Terminada el ${fecha(s.agente.fecha)}${s.agente.diseno ? ` · ${s.agente.diseno}` : ''}`, accion: s.agente.url ? { texto: 'Ver', href: s.agente.url } : undefined })
    if (s.agente?.estado === 'error') tareas.push({ texto: 'El agente no pudo terminar', sub: s.agente.motivo, accion: { texto: 'Ver el agente', hacer: () => document.getElementById('fx-agente')?.scrollIntoView({ block: 'center', behavior: 'smooth' }) } })
    if (fase === 'comenzado' && s.encargo_tipo === 'custom' && !s.agente) tareas.push({ texto: 'Escribe el brief de dirección', sub: 'El agente de custom empieza al guardarlo', accion: { texto: 'Escribir brief', hacer: () => setVerBrief(true) } })
    if (antesDeComenzar(s) && s.material_completo) tareas.push({ texto: 'El cliente ya lo ha subido todo', sub: 'Pulsa «Comenzar» cuando veas cobrado el pago 1', accion: { texto: 'Comenzar', hacer: () => setMover('comenzado') } })
    if (s.drive_error && !s.drive_url) tareas.push({ texto: 'No se pudo crear la carpeta de Drive', sub: s.drive_error })
    const rec = fase ? EMAIL_RECORDATORIO[fase] : undefined
    if (parado && rec && s.plantillas.includes(rec) && !s.borradores.some(b => b.plantilla === rec)) tareas.push({ texto: `Lleva ${dias(enFase)} en ${ETIQUETA_FASE[fase!]}`, sub: 'Puedes mandarle un recordatorio', accion: { texto: 'Recordatorio', hacer: () => abrirEmail(rec) } })
  }
  for (const b of borradoresLead) tareas.push({ texto: 'Tienes una respuesta preparada para el cliente', sub: b.m.asunto || 'Borrador', accion: { texto: 'Abrir conversación', hacer: () => setChat(true) } })
  const toca = tareas[0]

  return (
    <main className="main fx">
      <header className="fx__top">
        <div className="fx__tit">
          <h1>{p.nombre}</h1>
          <div className="fx__facts">
            {fase ? <span className={`fx__tag${parado ? ' aviso' : ''}`}>{ETIQUETA_FASE[fase]}</span> : <span className="fx__tag">Sin etapa</span>}
            <span>{p.marcaNombre}</span>
            {p.plan && <><span aria-hidden="true">·</span><span>{p.plan}</span></>}
            <span aria-hidden="true">·</span><span>{p.cliente}</span>
            {p.prueba && <span className="fx__tag aviso">Prueba · sin validez fiscal</span>}
          </div>
        </div>
        <div className="fx__acts">
          <button type="button" className="ghost" onClick={() => setChat(true)} aria-expanded={chat} aria-controls="fx-chat">{I.chat}Conversación{porAprobar > 0 && <span className="fx__badge" aria-label={`${porAprobar} por aprobar`}>{porAprobar}</span>}</button>
          {s?.drive_url && <a className="ghost" href={s.drive_url} target="_blank" rel="noreferrer">{I.folder}Drive</a>}
          {d.lead && <Link className="ghost" href={`/leads/${d.lead.id}`}>Lead</Link>}
        </div>
      </header>

      <section className="fx__kpis" aria-label="Resumen">
        <div className="fx__kpi">
          <span className="fx__l">Etapa{I.flag}</span>
          <span className="fx__v">{fase ? ETIQUETA_FASE[fase] : '—'} {idx >= 0 && <small>{idx + 1}/{d.fases.length}</small>}</span>
          <span className={`fx__s${parado ? ' aviso' : ''}`}>{s && fase ? `${dias(enFase)} en esta etapa${parado ? ' · parado' : ''}` : 'Sin seguimiento por etapas'}</span>
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Cobrado{I.euro}</span>
          {d.dinero.tipo === 'cerrado' ? (() => {
            const cob = d.dinero.unica ? (d.dinero.unica.estado === 'cobrada' ? d.dinero.unica.importe : 0) : d.dinero.pagos.filter(x => x.estado === 'cobrada').reduce((t, x) => t + x.importe, 0)
            return <><span className="fx__v">{eur(cob)} <small>/ {eur(d.dinero.precio)}</small></span><span className="fx__meter"><i style={{ width: `${d.dinero.precio ? Math.min(100, cob / d.dinero.precio * 100) : 0}%` }} /></span></>
          })() : <><span className="fx__v">{eur(d.dinero.facturas.filter(f => f.estado === 'cobrada').reduce((t, f) => t + f.importe, 0))}</span><span className="fx__s">{d.dinero.dias} días · {eur(d.dinero.base)} trabajados</span></>}
        </div>
        <div className="fx__kpi">
          <span className="fx__l">{s ? 'Siguiente' : 'Estado'}{I.cal}</span>
          {s ? <>
            <span className="fx__v">{siguiente ? ETIQUETA_FASE[siguiente] : 'Terminado'}</span>
            <span className="fx__s">{fase ? AHORA[fase] : 'Toca la etapa en la que está'}</span>
          </> : <>
            <span className="fx__v">{ESTADO_TS[p.status] || p.status}</span>
            <span className="fx__s">Se lleva en su timesheet</span>
          </>}
        </div>
        <div className="fx__kpi">
          <span className="fx__l">Cliente{I.users}</span>
          <span className="fx__v fx__v--txt">{p.contacto || p.cliente}</span>
          <span className="fx__s">{ultimoEntrante ? `Último mensaje: ${fecha(ultimoEntrante.fecha)}` : p.email || 'Sin email'}</span>
        </div>
      </section>

      {toca && (
        <section className="fx__now" aria-label="Lo que te toca">
          <span className="fx__ic" aria-hidden="true">{I.eye}</span>
          <div className="fx__w"><b>{toca.texto}</b>{toca.sub && <span>{toca.sub}</span>}{tareas.length > 1 && <span className="caps dim">y {tareas.length - 1} cosa{tareas.length > 2 ? 's' : ''} más</span>}</div>
          {toca.accion && (toca.accion.href
            ? <a className="pill pill--sm" href={toca.accion.href} target="_blank" rel="noreferrer">{toca.accion.texto}</a>
            : <button type="button" className="pill pill--sm" onClick={toca.accion.hacer}>{toca.accion.texto}</button>)}
        </section>
      )}
      {tareas.length > 1 && (
        <ul className="fx__mas">
          {tareas.slice(1).map((t, i) => (
            <li key={i}><i aria-hidden="true" /><span><b>{t.texto}</b>{t.sub && <span> · {t.sub}</span>}</span>
              {t.accion && (t.accion.href ? <a className="copy caps" href={t.accion.href} target="_blank" rel="noreferrer">{t.accion.texto} →</a> : <button type="button" className="copy caps" onClick={t.accion.hacer}>{t.accion.texto} →</button>)}
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="nota">{aviso}</p>}

      {email && <div id="fx-email"><EmailPanel key={`${email.clave}-${email.mensaje ?? ''}`} proyectoId={p.id} clave={email.clave} mensajeId={email.mensaje} onCerrar={() => setEmail(null)} /></div>}

      {/* Etapas: la hecha queda marcada; un toque en otra pide confirmación y la guarda */}
      {s && <section className="fx__card" aria-labelledby="fx-et">
        <header><h2 id="fx-et">{I.flag}Etapas</h2><span className="caps dim">Desde el {fecha(p.created_at)}</span></header>
        <ol className="fx__steps" style={{ ['--n' as string]: d.fases.length }}>
          {d.fases.map((f, i) => {
            const estado = i < idx ? 'd' : i === idx ? 'c' : ''
            return (
              <li key={f} className={`fx__st${estado ? ` is-${estado}` : ''}${mover === f ? ' is-elegido' : ''}`}>
                <button type="button" onClick={() => { setError(''); setMover(i === idx || mover === f ? null : f) }}
                  aria-label={i === idx ? `Etapa actual: ${ETIQUETA_FASE[f]}` : `Mover a ${ETIQUETA_FASE[f]}`}>
                  <span className="fx__dotw"><span className="fx__dot">{estado === 'd' && I.check}</span><span className="fx__ln" /></span>
                  <span className="fx__nm">{ETIQUETA_FASE[f]}</span>
                  <span className="fx__dt">{d.fechaFase[f] ? fecha(d.fechaFase[f]!) : i === idx ? 'ahora' : '—'}</span>
                </button>
              </li>
            )
          })}
        </ol>
        {mover && s && (
          <div className="trk__mover fx__mover">
            <span>Mover a <b>{ETIQUETA_FASE[mover]}</b>{fase ? <> desde {ETIQUETA_FASE[fase]}</> : null}{mover === 'comenzado' && <> · {alComenzar(s)}</>}</span>
            {mover === 'comenzado' && <span className="nota">Púlsalo cuando veas cobrado el pago 1.</span>}
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
      </section>}

      <div className="fx__grid">
        <div className="fx__col">
          <section className="fx__card" aria-label="Conversación">
            <button type="button" className="fx__chatbar" onClick={() => setChat(true)} aria-controls="fx-chat">
              <span className="fx__av" aria-hidden="true">{iniciales(p.contacto || p.cliente)}</span>
              <span className="fx__tx"><b>Conversación con {p.contacto || p.cliente}</b>
                <span>{borradoresLead[0] ? `Borrador por aprobar: «${borradoresLead[0].m.asunto || 'sin asunto'}»` : ultimoEntrante && ultimoEntrante.tipo === 'msg' ? `Último: «${ultimoEntrante.m.asunto || ultimoEntrante.m.cuerpo.slice(0, 60)}»` : `${d.hilo.filter(x => x.tipo === 'msg').length} emails`}</span>
              </span>
              {porAprobar > 0 && <span className="fx__badge">{porAprobar}</span>}
            </button>
          </section>

          {d.enlaces.length > 0 && (
            <section className="fx__card" aria-labelledby="fx-en">
              <header><h2 id="fx-en">{I.link}Enlaces</h2><span className="caps dim">{d.enlaces.length}</span></header>
              <div className="fx__tiles">
                {d.enlaces.map(e => (
                  <a key={e.titulo} className="fx__tile" href={e.url} target="_blank" rel="noreferrer">
                    <span className="fx__tt">{I[e.icono]}<span className={`fx__tag${e.tono ? ` ${e.tono}` : ''}`}>{e.estado}</span></span>
                    <b>{e.titulo}</b><span className="fx__u">{e.url.replace(/^https?:\/\//, '')}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="fx__card" aria-labelledby="fx-hi">
            <header><h2 id="fx-hi">{I.clock}Historial</h2><span className="caps dim">{d.historial.length}</span></header>
            {d.historial.length === 0 ? <p className="nota">Todavía no ha pasado nada.</p> : (
              <ul className="fx__tl">
                {d.historial.map((h, i) => <li key={h.clave}><span className={`fx__p${h.aviso ? ' a' : i === 0 ? ' g' : ''}`} /><span className="fx__ev">{h.texto}</span><span className="caps dim">{fecha(h.fecha)}</span></li>)}
              </ul>
            )}
          </section>
        </div>

        <aside className="fx__col">
          <section className="fx__card" aria-labelledby="fx-di">
            <header><h2 id="fx-di">{I.euro}Dinero</h2><span className="caps dim">Base sin IVA</span></header>
            {d.dinero.tipo === 'cerrado' ? (
              <table className="fx__tbl"><tbody>
                {d.dinero.unica ? (
                  <tr><td>Factura única{d.dinero.unica.numero ? ` · ${d.dinero.unica.numero}` : ''}</td><td><EstadoPago x={d.dinero.unica} /></td></tr>
                ) : d.dinero.pagos.map(x => (
                  <tr key={x.n}>
                    <td>Pago {x.n} · {x.facturaId ? <a href={`/invoice/${x.facturaId}`} target="_blank" rel="noreferrer">{x.numero}</a> : ETIQUETA_PAGO[x.n - 1]}<small className="dim"> · {eur(x.importe)}</small></td>
                    <td><EstadoPago x={x} /></td>
                  </tr>
                ))}
                <tr className="fx__tot"><td>Precio</td><td className="num">{eur(d.dinero.precio)}</td></tr>
              </tbody></table>
            ) : (
              <table className="fx__tbl"><tbody>
                <tr><td>Días trabajados</td><td className="num">{d.dinero.dias}</td></tr>
                {d.dinero.facturas.map(f => <tr key={f.id}><td><a href={`/invoice/${f.id}`} target="_blank" rel="noreferrer">{f.numero || 'Factura'}</a><small className="dim"> · {eur(f.importe)}</small></td><td><span className={`fx__tag${f.estado === 'cobrada' ? ' ok' : ''}`}>{f.estado === 'cobrada' ? 'Cobrada' : 'Pendiente'}</span></td></tr>)}
                <tr className="fx__tot"><td>Trabajado</td><td className="num">{eur(d.dinero.base)}</td></tr>
              </tbody></table>
            )}
            {p.marca && <Link href={`/work/${p.marca}`} className="copy caps">{d.dinero.tipo === 'cerrado' ? 'Facturar los pagos en' : 'Timesheet de'} {p.marcaNombre} →</Link>}
          </section>

          {s && (s.drive_url || SUBCARPETAS[p.marca || ''] || s.material) && (
            <section className="fx__card" aria-labelledby="fx-ma">
              <header><h2 id="fx-ma">{I.folder}Material</h2>{s.material_completo && <span className="fx__tag ok">Completo</span>}</header>
              <dl className="fx__kv">
                {s.material && <><dt>Copiado para el agente</dt><dd>{s.material.copiados}{s.material.pendientes ? ` · ${s.material.pendientes} pendientes` : ''}</dd></>}
                {s.material?.errores.length ? <><dt>Con error</dt><dd className="aviso">{s.material.errores.length}</dd></> : null}
              </dl>
              <DriveCarpeta proyectoId={p.id} url={s.drive_url} error={s.drive_error} />
            </section>
          )}

          {s && (
            <section className="fx__card" id="fx-agente" aria-labelledby="fx-ag">
              <header><h2 id="fx-ag">{I.bot}Agente</h2><span className="caps dim">{s.encargo_tipo ? NOMBRE_ENCARGO[s.encargo_tipo] : 'Lo haces tú'}</span></header>
              <div className="fx__agente">
                {s.agente ? <><AgenteWeb p={s} /><AgenteWeb p={s} detalle /></> : s.encargo_tipo && s.fase === 'comenzado' ? <AgenteWeb p={s} /> : <p className="nota">{s.encargo_tipo ? 'Sin encargo todavía: empieza al pulsar «Comenzar».' : 'Esta marca no tiene agente.'}</p>}
                <RefEntrega proyectoId={p.id} valor={s.ref_entrega} />
                {s.encargo_tipo === 'custom' && !verBrief && <button type="button" className="copy caps" onClick={() => setVerBrief(true)}>{s.brief ? 'Ver el brief' : 'Escribir el brief'} →</button>}
              </div>
            </section>
          )}
          {s && verBrief && s.encargo_tipo === 'custom' && <BriefPanel p={s} />}

          <section className="fx__card" aria-labelledby="fx-cl">
            <header><h2 id="fx-cl">{I.users}Cliente</h2></header>
            <dl className="fx__kv">
              <dt>Cliente fiscal</dt><dd>{p.cliente}</dd>
              {d.cliente?.identificador && <><dt>NIF</dt><dd className="num">{d.cliente.identificador}</dd></>}
              <dt>País</dt><dd>{d.cliente?.pais ? PAIS[d.cliente.pais] || d.cliente.pais : <span className="aviso">Sin datos fiscales</span>}</dd>
              {p.contacto && <><dt>Contacto</dt><dd>{p.contacto}</dd></>}
              {p.email && <><dt>Email</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd></>}
              {s && s.plantillas.length > 0 && fase && [EMAIL_AL_ENTRAR[fase], EMAIL_RECORDATORIO[fase]].some(c => c && s.plantillas.includes(c)) && (
                <><dt>Emails de la etapa</dt><dd className="fx__emails">{[EMAIL_AL_ENTRAR[fase], EMAIL_RECORDATORIO[fase]].filter((c): c is string => !!c && s.plantillas.includes(c)).map(c => (
                  <button key={c} type="button" className="copy caps" onClick={() => abrirEmail(c)}>✉ {NOMBRE_EMAIL[c]}</button>
                ))}</dd></>
              )}
            </dl>
          </section>
        </aside>
      </div>

      <Conversacion abierta={chat} onCerrar={() => setChat(false)} d={d} onEmail={abrirEmail} />
    </main>
  )
}

function EstadoPago({ x }: { x: Pago }) {
  return <span className={`fx__tag${x.estado === 'cobrada' ? ' ok' : x.estado === 'pendiente' ? ' aviso' : ''}`}>{x.estado === 'cobrada' ? 'Cobrado' : x.estado === 'pendiente' ? 'Facturado' : 'Sin facturar'}</span>
}

