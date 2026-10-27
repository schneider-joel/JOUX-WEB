'use client'

import { useRef, useState } from 'react'
import type { PeticionPublica } from '@/lib/cartela-cambios'

const EJEMPLOS = [
  { t: '💶 Cambiar un precio', v: 'Sube la caña a 2,80' },
  { t: '⛔ Agotado hoy', v: 'Hoy no hay alitas glaseadas' },
  { t: '➕ Plato nuevo', v: 'Añade tarta de queso al horno, 5 €. Lleva huevo, lácteos y gluten' },
  { t: '🕒 Horario', v: 'El lunes 3 cerramos por descanso' },
]

const ERRORES: Record<string, string> = {
  vacio: 'Escribe qué quieres cambiar o adjunta una foto.',
  foto: 'La foto no se pudo subir. Prueba con otra o mándala en JPG.',
  limite: 'Hoy ya nos has mandado muchos cambios. Si es urgente, escríbenos a hola@cartela.live.',
  pausado: 'Los cambios de esta carta están en pausa. Escríbenos a hola@cartela.live.',
  enlace: 'Este enlace ya no es válido.',
  revision: 'Tu carta aún está en revisión: las correcciones, respondiendo a nuestro correo.',
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

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

function Estado({ p }: { p: PeticionPublica }) {
  if (p.estado === 'publicada') return <span className="cz__pill cz__pill--ok"><i />Publicado{p.actualizada_at ? ` · ${fecha(p.actualizada_at)}` : ''}</span>
  if (p.estado === 'en_curso') return <span className="cz__pill cz__pill--curso"><i />En marcha · lo estamos cambiando</span>
  if (p.estado === 'escalada') return <span className="cz__pill cz__pill--rev"><i />Lo está revisando Joel · te escribimos pronto</span>
  return <span className="cz__pill"><i />Recibido · lo aplicamos en 24 h laborables</span>
}

export default function Cambios({ token, nombre, urlCarta, conQr, entregada, pausado, inicial }: {
  token: string; nombre: string; urlCarta: string | null; conQr: boolean; entregada: boolean; pausado: boolean; inicial: PeticionPublica[]
}) {
  const [lista, setLista] = useState(inicial)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(pausado ? ERRORES.pausado : '')
  const area = useRef<HTMLTextAreaElement>(null)
  const archivo = useRef<HTMLInputElement>(null)

  const enviar = async () => {
    if (!texto.trim() && !foto) { setError(ERRORES.vacio); area.current?.focus(); return }
    setEnviando(true); setError('')
    const form = new FormData()
    form.set('texto', texto)
    if (foto) form.set('foto', await reducir(foto))
    const r = await fetch(`/api/cambios/${token}`, { method: 'POST', body: form }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setError(ERRORES[j?.error] || 'No se pudo enviar. Inténtalo otra vez en un momento.'); return }
    setLista([j.peticion, ...lista]); setTexto(''); setFoto(null)
    if (archivo.current) archivo.current.value = ''
  }

  return (
    <main className="cz__app">
      <header className="cz__top">
        <div><b>{nombre}</b><span>Tu carta · enlace solo para ti</span></div>
      </header>

      {(urlCarta || (entregada && conQr)) && (
        <section className="cz__carta" aria-label="Tu carta">
          {entregada && conQr && <img src={`/api/cambios/${token}/qr?ver=1`} alt={`QR de la carta de ${nombre}`} width={96} height={96} />}
          <div>
            {urlCarta && <a className="cz__link" href={urlCarta} target="_blank" rel="noopener">{urlCarta.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>}
            {entregada && conQr && <a className="cz__ghost" href={`/api/cambios/${token}/qr`} download>Descargar el QR</a>}
          </div>
        </section>
      )}

      {!entregada ? (
        <section className="cz__pane">
          <h1>Tu carta está en revisión</h1>
          <p className="cz__sub">Mírala en el móvil y, si quieres corregir algo, respóndenos al correo (puedes mandar fotos). Cuando la demos por buena, aquí tendrás el QR y podrás pedir cambios cuando quieras.</p>
        </section>
      ) : (
      <section className="cz__pane">
        <h1>¿Qué cambiamos?</h1>
        <p className="cz__sub">Escríbelo como se lo dirías a un camarero. Lo cambiamos y te avisamos cuando esté en tu carta.</p>
        <div className="cz__chips">
          {EJEMPLOS.map(e => <button key={e.t} type="button" onClick={() => { setTexto(e.v); area.current?.focus() }}>{e.t}</button>)}
        </div>
        <textarea ref={area} value={texto} maxLength={2000} disabled={pausado} onChange={e => setTexto(e.target.value)}
          placeholder="Por ejemplo: «sube la caña a 2,80» o «hoy no hay pulpo»" aria-label="Qué quieres cambiar" />
        <div className="cz__row">
          <label className="cz__ghost">
            📷 Foto
            <input ref={archivo} type="file" accept="image/*" hidden disabled={pausado} onChange={e => setFoto(e.target.files?.[0] || null)} />
          </label>
          <button type="button" className="cz__send" disabled={enviando || pausado} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
        {foto && <p className="cz__att">📎 {foto.name} <button type="button" onClick={() => { setFoto(null); if (archivo.current) archivo.current.value = '' }}>Quitar</button></p>}
        {error && <p className="cz__error" role="alert">{error}</p>}
        <p className="cz__hint">Cambios ilimitados. Si algo toca alérgenos, te escribimos para confirmarlo antes de publicarlo.</p>

        <h2>Tus cambios</h2>
        {lista.length === 0 ? <p className="cz__sub">Aún no nos has pedido ninguno.</p> : lista.map(p => (
          <article key={p.id} className="cz__req">
            <p className="cz__q">«{p.texto}»{p.fotos ? <small> · {p.fotos === 1 ? '1 foto' : `${p.fotos} fotos`}</small> : null}</p>
            <p className="cz__when">Pedido el {fecha(p.created_at)}</p>
            <Estado p={p} />
            {p.estado === 'publicada' && p.nota && <p className="cz__nota"><small>Lo que cambiamos</small>{p.nota}</p>}
          </article>
        ))}
      </section>
      )}
    </main>
  )
}
