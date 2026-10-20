'use client'

import { useState } from 'react'

// Un email de la conversación como tarjeta propia. Solo el más reciente se ve entero; los
// anteriores salen recortados para que el hilo se pueda recorrer de un vistazo.
export default function EmailHilo({ entrante, etiqueta, quien, direccion, fecha, asunto, cuerpo, abierto, adjuntos = [] }: {
  entrante: boolean; etiqueta: string; quien: string; direccion: string | null; fecha: string; asunto: string | null; cuerpo: string; abierto: boolean
  adjuntos?: { nombre: string; url: string | null; peso: string }[]
}) {
  const largo = cuerpo.split('\n').length > 6 || cuerpo.length > 420
  const [visto, setVisto] = useState(abierto || !largo)
  return (
    <li className={`hilo__email${entrante ? ' hilo__email--entrante' : ''}`}>
      <div className="hilo__cab">
        <span className="hilo__quien">
          <span className={`hilo__tipo caps${entrante ? ' hilo__tipo--entrante' : ''}`}>{etiqueta}</span>
          <span>{quien}</span>
          {direccion && <span className="hilo__dir">{direccion}</span>}
        </span>
        <span className="hilo__fecha caps">{fecha}</span>
      </div>
      {asunto && <p className="hilo__asunto">{asunto}</p>}
      <p className={`lead__msg hilo__cuerpo${visto ? '' : ' hilo__cuerpo--corto'}`}>{cuerpo}</p>
      {adjuntos.length > 0 && (
        // Enlaces firmados de 1 h: si caducan, basta con recargar la ficha.
        <ul className="hilo__adjuntos">
          {adjuntos.map((a, i) => (
            <li key={i}>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : <span>{a.nombre}</span>}<span className="caps">{a.peso}</span></li>
          ))}
        </ul>
      )}
      {largo && <button type="button" className="copy caps hilo__mas" onClick={() => setVisto(!visto)}>{visto ? 'Ver menos' : 'Ver todo'}</button>}
    </li>
  )
}
