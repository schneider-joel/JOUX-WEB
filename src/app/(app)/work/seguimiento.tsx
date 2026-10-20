'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ETIQUETA_FASE, FASES_PROYECTO, type FaseProyecto } from '@/lib/leads'
import { AHORA, DIAS_ALERTA, ESTADO_RONDA, NOMBRE_ENCARGO, diasDesde, faltaBrief, fasesDe, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { EMAIL_AL_ENTRAR, EMAIL_RECORDATORIO, NOMBRE_EMAIL } from '@/lib/emails'
import EmailPanel from './email-panel'
import RefEntrega from './ref-entrega'
import DriveCarpeta from './drive-carpeta'
import AgenteWeb from './agente-web'
import BriefPanel from './brief'
import { SUBCARPETAS } from '@/lib/drive-carpetas'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
// «Comenzar» un proyecto con agente que aún no tiene encargo en marcha (ni hecho).
export const encargaAgente = (p: ProyectoSeguimiento, fase: FaseProyecto) =>
  fase === 'comenzado' && !!p.encargo_tipo && (!p.agente || p.agente.estado === 'error')
// Qué pasa al pulsar «Comenzar», en la confirmación.
export function alComenzar(p: ProyectoSeguimiento) {
  if (!p.encargo_tipo) return 'sin agente: la haces tú'
  if (p.agente && p.agente.estado !== 'error') return 'el encargo ya existe'
  if (p.encargo_tipo === 'custom' && faltaBrief(p.brief)) return 'el agente espera tu brief de dirección (se pide al comenzar)'
  if (p.encargo_tipo === 'treatment') return 'el agente empieza el treatment con el material de Drive'
  if (p.encargo_tipo === 'custom') return 'el agente de custom empieza con tu brief'
  return 'el agente monta la primera versión con el material que haya'
}
// Se puede «Comenzar» desde las etapas de antes (sin etapa, confirmado o material).
export const antesDeComenzar = (p: ProyectoSeguimiento) => !p.fase || p.fase === 'confirmado' || p.fase === 'material'
const dias = (n: number) => n === 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`

// Cada proyecto es una línea con sus siete etapas: lo hecho queda trazado, la etapa actual late
// (o se pone ámbar si lleva demasiado tiempo parada) y cualquier otra etapa se elige con un toque.
export default function Seguimiento({ proyectos, marcas }: { proyectos: ProyectoSeguimiento[]; marcas: { key: string; nombre: string }[] }) {
  const router = useRouter()
  const [marca, setMarca] = useState<string | null>(null)
  const [fase, setFase] = useState<FaseProyecto | 'sin' | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [mover, setMover] = useState<{ id: number; fase: FaseProyecto } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [nota, setNota] = useState('')  // para el agente, al «Comenzar»
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null)  // qué pasó con el encargo
  const [email, setEmail] = useState<{ id: number; clave: string; mensaje?: number } | null>(null)

  const nombreMarca = new Map(marcas.map(m => [m.key, m.nombre]))
  const conProyectos = marcas.filter(m => proyectos.some(p => p.marca === m.key))
  const deMarca = proyectos.filter(p => !marca || p.marca === marca)
  const cuenta = (f: FaseProyecto | 'sin') => deMarca.filter(p => (p.fase ?? 'sin') === f).length

  const lista = useMemo(() => deMarca
    .filter(p => fase ? (p.fase ?? 'sin') === fase : verCerrados || p.fase !== 'cerrado')
    // Primero los que no tienen etapa; después de la más avanzada a la menos.
    .sort((a, b) => (b.fase ? FASES_PROYECTO.indexOf(b.fase) : 99) - (a.fase ? FASES_PROYECTO.indexOf(a.fase) : 99)),
  [deMarca, fase, verCerrados])

  const confirmar = async () => {
    if (!mover) return
    setGuardando(true); setError('')
    const r = await fetch(`/api/proyectos/${mover.id}/fase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fase: mover.fase, ...(mover.fase === 'comenzado' && nota.trim() ? { nota: nota.trim() } : {}) }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo guardar'); return }
    // Custom sin brief: se abre la ficha con el brief para escribirlo.
    if (j?.encargo?.esperando_brief) { setAbierto(mover.id); setAviso({ id: mover.id, texto: 'Comenzado. Escribe el brief de dirección y el agente empieza al guardarlo.' }) }
    else if (j?.encargo?.omitido && mover.fase === 'comenzado') setAviso({ id: mover.id, texto: `Comenzado, sin encargo: ${j.encargo.omitido}` })
    else setAviso(null)
    // Si la nueva etapa tiene email para el cliente (y su marca lo tiene), se propone (no se envía solo).
    const clave = EMAIL_AL_ENTRAR[mover.fase]
    const p = proyectos.find(x => x.id === mover.id)
    setEmail(clave && p?.plantillas.includes(clave) ? { id: mover.id, clave } : null)
    setMover(null); setNota(''); router.refresh()
  }

  return (
    <div className="trk trk__ancho">
      <nav className="chips__row" aria-label="Marca">
        <button type="button" className="chip" aria-pressed={!marca} onClick={() => setMarca(null)}><span>Todas</span></button>
        {conProyectos.map(m => (
          <button key={m.key} type="button" className="chip" aria-pressed={marca === m.key} onClick={() => setMarca(marca === m.key ? null : m.key)}><span>{m.nombre}</span></button>
        ))}
      </nav>

      {/* Río: cuántos proyectos hay en cada etapa; un toque filtra */}
      <div className="trk__rio" role="group" aria-label="Etapas">
        {cuenta('sin') > 0 && (
          <button type="button" className="trk__r is-sin" aria-pressed={fase === 'sin'} onClick={() => setFase(fase === 'sin' ? null : 'sin')}>
            <span className="trk__rn">{cuenta('sin')}</span><span className="caps">Sin etapa</span>
          </button>
        )}
        {FASES_PROYECTO.map((f, i) => (
          <button key={f} type="button" className="trk__r" aria-pressed={fase === f} data-vacio={cuenta(f) === 0 || undefined} onClick={() => setFase(fase === f ? null : f)}>
            <span className="trk__rn">{cuenta(f)}</span><span className="caps"><span className="dim">{i + 1}</span> {ETIQUETA_FASE[f]}</span>
          </button>
        ))}
      </div>

      <div className="trk__cab caps" aria-hidden="true">
        <span>Proyecto</span>
        <span className="trk__cabfases">{FASES_PROYECTO.map((f, i) => <span key={f} title={ETIQUETA_FASE[f]}>{i + 1}</span>)}</span>
        <span>Ahora</span>
      </div>

      {lista.length === 0 ? <p className="empty">{proyectos.length ? 'Ningún proyecto en esta etapa.' : 'No hay proyectos en marcha. Aparecen al marcar un lead como ganado o al crear una web en Webs.'}</p> : (
        <ul className="trk__lista">
          {lista.map(p => {
            const idx = p.fase ? FASES_PROYECTO.indexOf(p.fase) : -1
            const propias = fasesDe(p.marca)
            const d = diasDesde(p.desde), limite = p.fase ? DIAS_ALERTA[p.fase] : null
            const parado = limite != null && d >= limite
            const pend = mover?.id === p.id ? mover : null
            return (
              <li key={p.id} className={`trk__p${parado ? ' is-parado' : ''}${!p.fase ? ' is-sin' : ''}`}>
                <button type="button" className="trk__q" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}>
                  <span className="trk__c">{p.cliente}</span>
                  <span className="trk__n">{p.nombre}</span>
                  <span className="caps trk__m">{nombreMarca.get(p.marca || '') || p.marca || 'Sin marca'}</span>
                </button>

                <div className="trk__linea" style={{ ['--p' as string]: idx < 0 ? 0 : idx / (FASES_PROYECTO.length - 1) }}>
                  {FASES_PROYECTO.map((f, i) => !propias.includes(f) ? <span key={f} className="trk__nodo is-salta" aria-hidden="true" /> : (
                    <button key={f} type="button" title={ETIQUETA_FASE[f]} aria-label={`${i === idx ? 'Etapa actual: ' : 'Mover a '}${ETIQUETA_FASE[f]}`}
                      className={`trk__nodo${i < idx ? ' is-hecho' : i === idx ? ' is-ahora' : ''}${pend?.fase === f ? ' is-elegido' : ''}`}
                      onClick={() => { setError(''); setMover(i === idx ? null : { id: p.id, fase: f }) }}>
                      <span className="sr">{ETIQUETA_FASE[f]}</span>
                    </button>
                  ))}
                </div>

                <div className="trk__ahora">
                  {p.fase ? (
                    <>
                      <span className="trk__fase">{ETIQUETA_FASE[p.fase]} <span className={`caps ${parado ? 'aviso' : 'dim'}`}>· {parado ? `parado ${d} d` : dias(d)}</span></span>
                      <span className="trk__que">{AHORA[p.fase]}</span>
                    </>
                  ) : <span className="trk__que">Toca la etapa en la que está</span>}
                  {/* Emails que dejó preparados un aviso de revisión o el cron: se revisan y se envían con un toque */}
                  {email?.id !== p.id && p.borradores.map(b => (
                    <button key={b.id} type="button" className={`copy caps trk__recordar${b.error ? ' aviso' : ''}`} title={b.error || undefined}
                      onClick={() => setEmail({ id: p.id, clave: b.plantilla, mensaje: b.id })}>
                      ✉ {NOMBRE_EMAIL[b.plantilla] || b.plantilla} {b.error ? '· no salió, reintentar' : 'listo para enviar'} →
                    </button>
                  ))}
                  {aviso?.id === p.id && <span className="nota trk__agente">{aviso.texto}</span>}
                  <Link href={`/proyectos/${p.id}`} className="copy caps trk__recordar trk__ficha">Abrir ficha →</Link>
                  {antesDeComenzar(p) && !pend && (
                    <button type="button" className={`copy caps trk__recordar${p.material_completo ? ' ok' : ''}`} onClick={() => { setError(''); setMover({ id: p.id, fase: 'comenzado' }) }}>
                      {p.material_completo ? 'Material completo · ' : ''}Comenzar{p.encargo_tipo ? ` · ${NOMBRE_ENCARGO[p.encargo_tipo]} al agente` : ''} →
                    </button>
                  )}
                  {p.fase === 'comenzado' && p.encargo_tipo === 'custom' && !p.agente && abierto !== p.id && (
                    <button type="button" className="copy caps trk__recordar aviso" onClick={() => setAbierto(p.id)}>Esperando brief · escribirlo →</button>
                  )}
                  {!pend && <AgenteWeb p={p} />}
                  {p.drive_error && !p.drive_url && abierto !== p.id && (
                    <button type="button" className="copy caps trk__recordar aviso" title={p.drive_error} onClick={() => setAbierto(p.id)}>Drive no se pudo crear · reintentar →</button>
                  )}
                  {parado && !p.material_completo && p.fase && EMAIL_RECORDATORIO[p.fase] && p.plantillas.includes(EMAIL_RECORDATORIO[p.fase]!) && email?.id !== p.id && !p.borradores.some(b => b.plantilla === EMAIL_RECORDATORIO[p.fase!]) && (
                    <button type="button" className="copy caps trk__recordar" onClick={() => setEmail({ id: p.id, clave: EMAIL_RECORDATORIO[p.fase!]! })}>Enviar recordatorio →</button>
                  )}
                </div>

                {pend && (
                  <div className="trk__mover">
                    <span>Mover a <b>{ETIQUETA_FASE[pend.fase]}</b>{p.fase ? <> desde {ETIQUETA_FASE[p.fase]}</> : null}{pend.fase === 'comenzado' && <> · {alComenzar(p)}</>}</span>
                    {pend.fase === 'comenzado' && <span className="nota">Púlsalo cuando veas cobrado el pago 1.</span>}
                    {encargaAgente(p, pend.fase) && !(p.encargo_tipo === 'custom' && faltaBrief(p.brief)) && (
                      <div className="field trk__nota">
                        <label className="caps" htmlFor={`nota-${p.id}`}>Nota para el agente (opcional)</label>
                        <input id={`nota-${p.id}`} value={nota} onChange={e => setNota(e.target.value)} maxLength={1000} placeholder={p.encargo_tipo === 'treatment' ? 'p. ej. que la dirección B sea más oscura' : 'p. ej. sin página de equipo'} />
                      </div>
                    )}
                    {error && <span className="nota error">{error}</span>}
                    <button type="button" className="copy caps" onClick={() => { setMover(null); setNota('') }}>Cancelar</button>
                    <button type="button" className="pill pill--sm" disabled={guardando} onClick={confirmar}>{guardando ? 'Guardando…' : 'Mover'}</button>
                  </div>
                )}

                {email?.id === p.id && <EmailPanel key={`${email.clave}-${email.mensaje ?? ''}`} proyectoId={p.id} clave={email.clave} mensajeId={email.mensaje} onCerrar={() => setEmail(null)} />}

                {abierto === p.id && p.encargo_tipo === 'custom' && <BriefPanel p={p} />}

                {abierto === p.id && (
                  <div className="trk__hist">
                    {p.historial.length === 0 ? <p className="nota">Aún sin cambios de etapa.</p> : (
                      <ol>
                        {p.historial.map((h, i) => <li key={i}><span className="caps dim">{fecha(h.fecha)}</span> {ETIQUETA_FASE[h.fase]}</li>)}
                      </ol>
                    )}
                    {p.rondas.length > 0 && (
                      <ol>{p.rondas.map(r => (
                        <li key={r.ronda} className={r.estado === 'comentada' ? 'ok' : undefined}>
                          <span className="caps dim">{fecha(r.abierta_en)}</span>{' '}
                          {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.ronda}</a> : r.ronda} · {ESTADO_RONDA[r.estado]}{r.comentarios > 0 && <> · {r.comentarios} coment.</>}
                        </li>
                      ))}</ol>
                    )}
                    {p.emails.length > 0 && (
                      <ol>{p.emails.map((e, i) => (
                        <li key={i} className={e.error ? 'aviso' : undefined} title={e.error || undefined}>
                          <span className="caps dim">{fecha(e.fecha)}</span> ✉ {NOMBRE_EMAIL[e.plantilla] || e.plantilla}{e.auto && <> · enviado automáticamente</>}{e.error &&<> · {e.error}</>}
                        </li>
                      ))}</ol>
                    )}
                    <AgenteWeb p={p} detalle />
                    <RefEntrega proyectoId={p.id} valor={p.ref_entrega} />
                    <span className="trk__acc">
                      {p.fase && [EMAIL_AL_ENTRAR[p.fase], EMAIL_RECORDATORIO[p.fase]].filter((c): c is string => !!c && p.plantillas.includes(c)).map(c => (
                        <button key={c} type="button" className="copy caps" onClick={() => setEmail({ id: p.id, clave: c })}>✉ {NOMBRE_EMAIL[c]}</button>
                      ))}
                      {(p.drive_url || SUBCARPETAS[p.marca || '']) && <DriveCarpeta proyectoId={p.id} url={p.drive_url} error={p.drive_error} />}
                      {p.lead_id && <Link href={`/leads/${p.lead_id}`} className="copy caps">Ver el lead →</Link>}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!fase && cuenta('cerrado') > 0 && (
        <button type="button" className="copy caps trk__cerrados" onClick={() => setVerCerrados(!verCerrados)}>
          {verCerrados ? 'Ocultar cerrados' : `Ver ${cuenta('cerrado')} cerrado${cuenta('cerrado') === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}
