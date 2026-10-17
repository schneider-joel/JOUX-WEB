'use client'

import { useState } from 'react'

type Inicial = { razon: string; nif: string; direccion: string } | null

const T = {
  es: {
    titulo: 'Datos de facturación', intro: 'Con estos datos preparo la factura del primer pago. Tardas un par de minutos.',
    razon: 'Nombre o razón social', nif: 'NIF / CIF (o número fiscal de tu país)', direccion: 'Dirección fiscal completa', dirPh: 'Calle, número\nCódigo postal, ciudad\nPaís',
    pais: 'País', elegir: 'Elige un país', otro: 'Otro país (fuera de la UE)', enviar: 'Enviar datos', enviando: 'Enviando…',
    gracias: '¡Gracias! Ya tengo tus datos. Te enviaré la factura por email.', corregir: 'Ya nos mandaste tus datos. Si algo no está bien, corrígelo y vuelve a enviarlos.',
    facturado: 'La factura ya está emitida con estos datos. Si hay que corregir algo, responde al email.',
    errores: { razon: 'Revisa el nombre o razón social.', nif: 'Revisa el NIF / CIF.', direccion: 'Escribe la dirección completa.', pais: 'Elige un país.', duplicado: 'Ya tenemos otro cliente con ese nombre. Responde al email y lo resolvemos.', facturado: 'La factura ya está emitida. Responde al email para corregir algo.', enlace: 'Este enlace no es válido.', otro: 'No se pudo enviar. Inténtalo otra vez en un momento.' },
  },
  en: {
    titulo: 'Billing details', intro: "I'll use these details for the first payment's invoice. It only takes a couple of minutes.",
    razon: 'Full name or company name', nif: 'Tax ID (VAT or national tax number)', direccion: 'Full billing address', dirPh: 'Street and number\nPostcode, city\nCountry',
    pais: 'Country', elegir: 'Choose a country', otro: 'Other country (outside the EU)', enviar: 'Send details', enviando: 'Sending…',
    gracias: "Thank you! I've got your details. I'll email you the invoice.", corregir: "You've already sent your details. If anything is wrong, fix it and send them again.",
    facturado: 'The invoice has already been issued with these details. To change anything, just reply to the email.',
    errores: { razon: 'Please check the name.', nif: 'Please check the tax ID.', direccion: 'Please write the full address.', pais: 'Please choose a country.', duplicado: 'We already have another client with that name. Reply to the email and we will sort it out.', facturado: 'The invoice has already been issued. Reply to the email to change anything.', enlace: 'This link is not valid.', otro: "Couldn't send. Please try again in a moment." },
  },
}

// Formulario del cliente: razón social, NIF, dirección y país (el país decide IVA y retención en la factura).
export default function FormDatos({ token, idioma, marca, proyecto, paises, inicial, facturado }: {
  token: string; idioma: 'es' | 'en'; marca: string; proyecto: string; paises: { iso: string; nombre: string }[]; inicial: Inicial; facturado: boolean
}) {
  const t = T[idioma]
  const [f, setF] = useState({ razon: inicial?.razon || '', nif: inicial?.nif || '', direccion: inicial?.direccion || '', pais: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError('')
    const r = await fetch(`/api/datos/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setError(t.errores[j?.error as keyof typeof t.errores] || t.errores.otro); return }
    setHecho(true)
  }

  return (
    <div className="col">
      <header className="page-header">
        <div className="page-header__txt">
          <p className="tags caps">{marca} · {proyecto}</p>
          <h1 className="page-title">{t.titulo}</h1>
        </div>
      </header>
      {hecho ? <p className="nota ok" style={{ fontSize: 16 }}>{t.gracias}</p> : facturado ? <p className="nota">{t.facturado}</p> : (
        <form className="block" style={{ gap: 18 }} onSubmit={enviar}>
          <p className="nota">{inicial ? t.corregir : t.intro}</p>
          <div className="field">
            <label className="caps" htmlFor="d-razon">{t.razon}</label>
            <input id="d-razon" required maxLength={200} autoComplete="organization" value={f.razon} onChange={e => setF({ ...f, razon: e.target.value })} />
          </div>
          <div className="field">
            <label className="caps" htmlFor="d-nif">{t.nif}</label>
            <input id="d-nif" required maxLength={40} autoCapitalize="characters" value={f.nif} onChange={e => setF({ ...f, nif: e.target.value })} />
          </div>
          <div className="field">
            <label className="caps" htmlFor="d-pais">{t.pais}</label>
            <span className="field__sel">
              <select id="d-pais" required value={f.pais} onChange={e => setF({ ...f, pais: e.target.value })}>
                <option value="" disabled>{t.elegir}</option>
                {paises.map(p => <option key={p.iso} value={p.iso}>{p.nombre}</option>)}
                <option value="OTRO">{t.otro}</option>
              </select>
            </span>
          </div>
          <div className="field">
            <label className="caps" htmlFor="d-dir">{t.direccion}</label>
            <textarea id="d-dir" required rows={3} maxLength={500} autoComplete="street-address" placeholder={t.dirPh} value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
          </div>
          {error && <p className="nota error">{error}</p>}
          <button type="submit" className="pill" disabled={enviando} style={{ alignSelf: 'flex-start' }}>{enviando ? t.enviando : t.enviar}</button>
        </form>
      )}
    </div>
  )
}
