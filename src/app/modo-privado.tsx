'use client'

import { useEffect, useState } from 'react'

// Modo privado: tapa los importes de todo el hub con "•••" para enseñarlo sin
// mostrar cifras. Actúa sobre el texto ya pintado (sin tocar ningún formateador)
// y vuelve a taparlo cada vez que React lo actualiza. Se recuerda en este
// navegador; al desactivarlo se recarga la página para recuperar las cifras.
const CLAVE = 'joux_privado'

// Texto con un importe (€ o $ junto a un número), un porcentaje, o que es solo un número
// (los componentes suelen pintar "€" y la cifra en nodos separados).
const CON_IMPORTE = /[€$]\s*[+−-]?\d|\d\s*[€$%]|\d\s*meses de colchón/
const SOLO_NUMERO = /^[\s€$+−\-–▲▼•(/]*\d[\d.,\s]*(%|k|h|\))?\s*$/

// Un número suelto pequeño (T3, 8 de 31, contadores) o un año no es un importe,
// salvo que vaya junto a "€", "$", "/" o "%" (p. ej. "€" + "33", "/ " + "40", "58" + "%").
const NEUTRO = /^\s*(\d{1,2}|(19|20)\d\d)\s*$/
function esImporteSuelto(nodo: Text, t: string) {
  if (!NEUTRO.test(t)) return true
  const antes = (nodo.previousSibling?.textContent || '').trimEnd()
  const despues = (nodo.nextSibling?.textContent || '').trimStart()
  return /[€$\/]$/.test(antes) || /^[%€]/.test(despues)
}

function tapar(nodo: Text) {
  const t = nodo.nodeValue
  if (!t || !/\d/.test(t)) return
  if (!CON_IMPORTE.test(t) && !(SOLO_NUMERO.test(t) && esImporteSuelto(nodo, t))) return
  const tapado = t.replace(/\d[\d.,]*/g, '•••')
  if (tapado !== t) nodo.nodeValue = tapado
}

function taparTodo(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) return tapar(raiz as Text)
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) tapar(n as Text)
}

const leer = () => { try { return localStorage.getItem(CLAVE) === '1' } catch { return false } }

export default function ModoPrivado() {
  const [activo, setActivo] = useState(false)

  useEffect(() => { setActivo(leer()) }, [])

  useEffect(() => {
    if (!activo) return
    document.documentElement.dataset.privado = '1'
    taparTodo(document.body)
    const obs = new MutationObserver(cambios => {
      for (const c of cambios) {
        if (c.type === 'characterData') tapar(c.target as Text)
        else c.addedNodes.forEach(n => taparTodo(n))
      }
    })
    obs.observe(document.body, { subtree: true, childList: true, characterData: true })
    return () => obs.disconnect()
  }, [activo])

  const alternar = () => {
    if (activo) {
      try { localStorage.removeItem(CLAVE) } catch {}
      window.location.reload()
      return
    }
    try { localStorage.setItem(CLAVE, '1') } catch {}
    setActivo(true)
  }

  const titulo = activo ? 'Mostrar importes' : 'Ocultar importes (modo privado)'
  return (
    <button className={`icon-btn${activo ? ' accent' : ''}`} onClick={alternar} title={titulo} aria-label={titulo} aria-pressed={activo}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {activo ? (
          <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5.5 0 9 7 9 7a16.6 16.6 0 0 1-2.4 3.3M6.6 6.6C4.2 8.2 3 12 3 12s3.5 7 9 7a9.5 9.5 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
        ) : (
          <><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="3" /></>
        )}
      </svg>
    </button>
  )
}
