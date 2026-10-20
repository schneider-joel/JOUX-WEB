'use client'

import { useCallback, useEffect, useState } from 'react'
import Conversacion, { iniciales, type DatosConversacion } from '../../proyectos/[id]/conversacion'

// Ficha del lead: el mismo panel de conversación que la ficha del proyecto. Los botones que lo abren
// pueden estar en varios sitios de la página (cabecera y bloque «Conversación»): avisan con un evento.
const ABRIR = 'joux:chat'

export function BotonChat({ texto = 'Conversación', badge = 0, barra }: { texto?: string; badge?: number; barra?: { nombre: string; linea: string } }) {
  const abrir = () => window.dispatchEvent(new Event(ABRIR))
  if (barra) return (
    <button type="button" className="fx__chatbar" onClick={abrir} aria-controls="fx-chat">
      <span className="fx__av" aria-hidden="true">{iniciales(barra.nombre)}</span>
      <span className="fx__tx"><b>Conversación con {barra.nombre}</b><span>{barra.linea}</span></span>
      {badge > 0 && <span className="fx__badge">{badge}</span>}
    </button>
  )
  return (
    <button type="button" className="ghost" onClick={abrir} aria-controls="fx-chat">
      <svg className="sh__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>{texto}
      {badge > 0 && <span className="fx__badge">{badge}</span>}
    </button>
  )
}

export function PanelChat({ c }: { c: DatosConversacion }) {
  const [abierta, setAbierta] = useState(false)
  useEffect(() => {
    const abrir = () => setAbierta(true)
    window.addEventListener(ABRIR, abrir)
    return () => window.removeEventListener(ABRIR, abrir)
  }, [])
  const cerrar = useCallback(() => setAbierta(false), [])
  return <Conversacion abierta={abierta} onCerrar={cerrar} c={c} />
}
