'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PeticionPublica } from '@/lib/cartela-cambios'

// Atajos: empiezan la frase (nunca un ejemplo que se pueda enviar tal cual) y enseñan cómo acabarla.
const ATAJOS = [
  { t: 'Un precio', v: 'Cambia el precio de ', e: 'Cambia el precio de la caña a 2,80 €' },
  { t: 'Agotado hoy', v: 'Hoy no hay ', e: 'Hoy no hay alitas glaseadas' },
  { t: 'Plato nuevo', v: 'Añade ', e: 'Añade tarta de queso al horno, 5 €. Lleva huevo, lácteos y gluten' },
  { t: 'Quitar un plato', v: 'Quita de la carta ', e: 'Quita de la carta la ensaladilla' },
  { t: 'Horario', v: 'Horario: ', e: 'Horario: el lunes 3 cerramos por descanso' },
]

const ERRORES: Record<string, string> = {
  vacio: 'Escribe qué quieres cambiar o adjunta una foto.',
  foto: 'La foto no se pudo subir. Prueba con otra o mándala en JPG.',
  limite: 'Hoy ya nos has mandado muchos cambios. Si es urgente, escríbenos a hola@cartela.live.',
  pausado: 'Los cambios de esta carta están en pausa. Escríbenos a hola@cartela.live.',
  enlace: 'Este enlace ya no es válido.',
  revision: 'Tu carta aún está en revisión: las correcciones, respondiendo a nuestro correo.',
}

const TZ = 'Europe/Madrid'
const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const hora = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

// «hoy a las 19:40», «ayer a las…», «el jueves a las…» o «el 30 oct a las…», en hora de Madrid.
function cuando(iso: string) {
  const d = new Date(iso)
  const dias = Math.round((Date.parse(dia(new Date())) - Date.parse(dia(d))) / 864e5)
  const h = `a las ${hora(d)}`
  if (dias <= 0) return `hoy ${h}`
  if (dias === 1) return `ayer ${h}`
  if (dias < 7) return `el ${d.toLocaleDateString('es-ES', { weekday: 'long', timeZone: TZ })} ${h}`
  return `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '')} ${h}`
}

// Reduce la foto en el navegador (lado largo 1600 px, JPG): las del móvil pesan más de lo que admite la subida.
async function reducir(f: File): Promise<File> {
  try {
    const img = await createImageBitmap(f)
    const k = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : f
  } catch {
    // Formato que el navegador no sabe abrir (p. ej. HEIC fuera de Safari): se manda tal cual.
    return f
  }
}

// Símbolo de Cartela a tamaño pequeño (el 3×3 del favicon, marca/kit/favicon/favicon.svg).
export function Simbolo() {
  const cuadros: [number, number, number][] = [[0, 0, 1], [1, 0, .5], [2, 0, 2], [0, 1, .5], [2, 1, .5], [0, 2, 1], [1, 2, .5], [2, 2, 1]]
  return (
    <svg className="cz__simbolo" viewBox="0 0 60 60" aria-hidden="true">
      <clipPath id="cz-simbolo"><rect width="60" height="60" rx="9" /></clipPath>
      <g clipPath="url(#cz-simbolo)">
        {cuadros.map(([x, y, o]) => <rect key={`${x}${y}`} x={x * 20} y={y * 20} width="20.05" height="20.05" fill={o === 2 ? '#231B17' : '#D3371E'} fillOpacity={o === 2 ? 1 : o} />)}
      </g>
    </svg>
  )
}

const PASOS = ['Recibido', 'En marcha', 'Publicado']

function Estado({ p }: { p: PeticionPublica }) {
  const paso = p.estado === 'publicada' ? 2 : p.estado === 'en_curso' ? 1 : 0
  const texto = p.parar ? 'Nos has pedido que lo paremos. Te avisamos de cómo queda.'
    : p.estado === 'publicada' ? `Publicado${p.actualizada_at ? ` ${cuando(p.actualizada_at)}` : ''}. Ya está en tu carta.`
    : p.estado === 'en_curso' ? 'Lo estamos cambiando ahora.'
    : p.estado === 'escalada' ? 'Lo está revisando Joel. Te escribimos pronto.'
    : 'Lo aplicamos en 24 h laborables.'
  return (
    <div className={`cz__estado cz__estado--${p.estado}`}>
      {p.estado === 'escalada' ? <span className="cz__pill"><i />Revisándolo</span> : (
        <ol className="cz__pasos" aria-label={`Estado: ${PASOS[paso]}`}>
          {PASOS.map((t, i) => <li key={t} className={i < paso ? 'hecho' : i === paso ? 'ahora' : ''} aria-current={i === paso ? 'step' : undefined}>{t}</li>)}
        </ol>
      )}
      <p suppressHydrationWarning>{texto}</p>
    </div>
  )
}

export default function Cambios({ token, nombre, urlCarta, qr, entregada, pausado, inicial }: {
  token: string; nombre: string; urlCarta: string | null; qr: { ver: string; descargar: string } | null; entregada: boolean; pausado: boolean; inicial: PeticionPublica[]
}) {
  const router = useRouter()
  const [lista, setLista] = useState(inicial)
  const [texto, setTexto] = useState('')
  const [ejemplo, setEjemplo] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [vista, setVista] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState<number | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  // El estado de cada cambio lo mueve Joel desde el hub: al volver a la pestaña, la página se pide de nuevo.
  useEffect(() => setLista(inicial), [inicial])
  useEffect(() => {
    const volver = () => { if (document.visibilityState === 'visible') router.refresh() }
    document.addEventListener('visibilitychange', volver)
    return () => document.removeEventListener('visibilitychange', volver)
  }, [router])

  useEffect(() => {
    if (!foto) { setVista(''); return }
    const u = URL.createObjectURL(foto)
    setVista(u)
    return () => URL.revokeObjectURL(u)
  }, [foto])

  const atajo = (a: typeof ATAJOS[number]) => {
    const t = texto.trim() ? `${texto.replace(/\s+$/, '')}\n${a.v}` : a.v
    setTexto(t); setEjemplo(a.e); setError('')
    requestAnimationFrame(() => { const el = area.current; if (el) { el.focus(); el.setSelectionRange(t.length, t.length) } })
  }

  const quitarFoto = () => { setFoto(null); if (archivo.current) archivo.current.value = '' }

  // Solo el comienzo de un atajo («Cambia el precio de») no es un cambio: falta acabar la frase.
  const sinTexto = !texto.trim() || ATAJOS.some(a => a.v.trim() === texto.trim())
  const vacio = sinTexto && !foto

  const enviar = async () => {
    if (enviando) return
    if (sinTexto && !foto) { setError(ERRORES.vacio); area.current?.focus(); return }
    setEnviando(true); setError(''); setNueva(null)
    const form = new FormData()
    form.set('texto', texto)
    if (foto) form.set('foto', await reducir(foto))
    const r = await fetch(`/api/cambios/${token}`, { method: 'POST', body: form }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setError(ERRORES[j?.error] || 'No se pudo enviar. Inténtalo otra vez en un momento.'); return }
    setLista([j.peticion, ...lista]); setNueva(j.peticion.id)
    setTexto(''); setEjemplo(''); quitarFoto()
  }

  const enMarcha = lista.filter(p => p.estado !== 'publicada').length

  return (
    <main className="cz__app">
      <header className="cz__top">
        <p className="cz__marca"><Simbolo />cartela</p>
        <h1>{nombre}</h1>
        <p className="cz__sub">Tu enlace privado para pedir cambios en la carta. Sin contraseña: guárdalo en favoritos.</p>
      </header>

      {urlCarta && (
        <section className="cz__carta" aria-label="Tu carta">
          {qr && <a href={qr.descargar} download className="cz__qr" title="Descargar el QR"><img src={qr.ver} alt={`QR de la carta de ${nombre}`} width={88} height={88} /></a>}
          <div>
            <small>Tu carta</small>
            <span className="cz__url">{urlCarta.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            <div className="cz__acciones">
              <a className="cz__btn cz__btn--tinta" href={urlCarta} target="_blank" rel="noopener">Abrir la carta ↗</a>
              {qr && <a className="cz__btn" href={qr.descargar} download>Descargar QR</a>}
            </div>
          </div>
        </section>
      )}

      {!entregada ? (
        <section className="cz__pane">
          <h2>Tu carta está en revisión</h2>
          <ol className="cz__revision">
            <li className="ahora"><b>Mírala en el móvil</b>Ábrela como la vería un cliente en la mesa.</li>
            <li><b>Respóndenos al correo</b>Con lo que quieras corregir. Puedes mandar fotos.</li>
            <li><b>La damos por buena</b>Y aquí tendrás el QR y podrás pedir cambios cuando quieras.</li>
          </ol>
        </section>
      ) : pausado ? (
        <section className="cz__pane">
          <div className="cz__aviso">
            <b>Los cambios están en pausa</b>
            <p>Para volver a pedir cambios, escríbenos a <a href="mailto:hola@cartela.live">hola@cartela.live</a>.</p>
          </div>
        </section>
      ) : (
        <section className="cz__pane">
          <h2>¿Qué cambiamos?</h2>
          <p className="cz__sub">Escríbelo como se lo dirías a un camarero. Lo cambiamos y te avisamos cuando esté en tu carta.</p>
          <div className="cz__chips" aria-label="Empezar con">
            {ATAJOS.map(a => <button key={a.t} type="button" onClick={() => atajo(a)}>{a.t}</button>)}
          </div>
          <textarea ref={area} value={texto} maxLength={2000} rows={4}
            onChange={e => { setTexto(e.target.value); if (error) setError(''); if (nueva) setNueva(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
            placeholder="Por ejemplo: sube la caña a 2,80 €, o hoy no hay pulpo" aria-label="Qué quieres cambiar" aria-describedby="cz-ejemplo" />
          <p id="cz-ejemplo" className="cz__ejemplo" aria-live="polite">{ejemplo && <>Por ejemplo: <i>«{ejemplo}»</i></>}</p>

          {foto && (
            <div className="cz__adjunto">
              {vista && <img src={vista} alt="" />}
              <span>Foto adjunta<small>Se manda con el cambio</small></span>
              <button type="button" onClick={quitarFoto} aria-label="Quitar la foto">Quitar</button>
            </div>
          )}

          <div className="cz__row">
            <label className="cz__btn">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              {foto ? 'Cambiar foto' : 'Añadir foto'}
              <input ref={archivo} type="file" accept="image/*" hidden onChange={e => setFoto(e.target.files?.[0] || null)} />
            </label>
            <button type="button" className={`cz__send${vacio ? ' cz__send--vacio' : ''}`} disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar cambio'}</button>
          </div>
          {error && <p className="cz__error" role="alert">{error}</p>}
          {nueva && <p className="cz__ok" role="status"><b>Recibido.</b> Lo aplicamos en 24 h laborables y te avisamos cuando esté en tu carta.</p>}
          <p className="cz__hint">Cambios ilimitados. Si algo toca alérgenos, te escribimos para confirmarlo antes de publicarlo.</p>
        </section>
      )}

      {entregada && (
        <section className="cz__pane cz__historial">
          <h2 className="cz__h3">Tus cambios{enMarcha > 0 && <span>{enMarcha} en marcha</span>}</h2>
          {lista.length === 0 ? <p className="cz__nada">Aún no nos has pedido ninguno. Cuando lo hagas, aquí verás en qué punto está cada cambio.</p> : lista.map(p => (
            <article key={p.id} className={`cz__req${p.id === nueva ? ' cz__req--nueva' : ''}`}>
              {p.plato_nombre && <p className="cz__plato">{p.plato_nombre}</p>}
              <p className="cz__q">«{p.texto}»</p>
              <p className="cz__when" suppressHydrationWarning>Pedido {cuando(p.created_at)}{p.fotos ? ` · ${p.fotos === 1 ? '1 foto' : `${p.fotos} fotos`}` : ''}</p>
              <Estado p={p} />
              {p.estado === 'publicada' && p.nota && <p className="cz__nota"><small>Lo que cambiamos</small>{p.nota}</p>}
            </article>
          ))}
        </section>
      )}

      <footer className="cz__pie">
        <p>¿Dudas o algo urgente? <a href="mailto:hola@cartela.live">hola@cartela.live</a></p>
        <p className="cz__lema">Tú cocinas. Nosotros la carta.</p>
      </footer>
    </main>
  )
}
