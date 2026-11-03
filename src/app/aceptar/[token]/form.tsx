'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const T = {
  es: {
    nombre: 'Tu nombre y apellidos', casilla: (v: number) => `He leído y acepto el presupuesto y las condiciones del servicio (v${v}).`,
    particular: 'Si contratas como particular, pides que empecemos antes de que acaben los 14 días de desistimiento.',
    aceptar: 'Aceptar el presupuesto', enviando: 'Enviando…',
    errores: { nombre: 'Escribe tu nombre.', casilla: 'Marca la casilla para aceptar.', anulado: 'Este presupuesto ya no está vigente.', caducado: 'Este presupuesto ha caducado.', enlace: 'Este enlace no es válido.', otro: 'No se pudo enviar. Inténtalo otra vez en un momento.' },
  },
  en: {
    nombre: 'Your full name', casilla: (v: number) => `I have read and accept the quote and the terms of service (v${v}).`,
    particular: '',
    aceptar: 'Accept the quote', enviando: 'Sending…',
    errores: { nombre: 'Please write your name.', casilla: 'Tick the box to accept.', anulado: 'This quote is no longer valid.', caducado: 'This quote has expired.', enlace: 'This link is not valid.', otro: "Couldn't send. Please try again in a moment." },
  },
}

// Nombre + casilla + botón. El botón no se activa sin la casilla; la página se recarga al aceptar y enseña la prueba.
export default function FormAceptar({ token, idioma, nombre: inicial, version }: { token: string; idioma: 'es' | 'en'; nombre: string; version: number }) {
  const t = T[idioma]
  const router = useRouter()
  const [nombre, setNombre] = useState(inicial)
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acepto) { setError(t.errores.casilla); return }
    setEnviando(true); setError('')
    const r = await fetch(`/api/aceptar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, acepto }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    if (!r?.ok) { setEnviando(false); setError(t.errores[j?.error as keyof typeof t.errores] || t.errores.otro); return }
    router.refresh()
  }

  return (
    <form className="pz__form" onSubmit={enviar}>
      <div className="pz__campo">
        <label className="pz__label" htmlFor="a-nombre">{t.nombre}</label>
        <input id="a-nombre" required minLength={2} maxLength={200} autoComplete="name" value={nombre} onChange={e => setNombre(e.target.value)} />
      </div>
      <label className="pz__casilla">
        <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
        <span>{t.casilla(version)}{t.particular && <small>{t.particular}</small>}</span>
      </label>
      {error && <p className="pz__error" role="alert">{error}</p>}
      <button type="submit" className="pz__btn" disabled={enviando || !acepto || nombre.trim().length < 2}>{enviando ? t.enviando : t.aceptar}</button>
    </form>
  )
}
