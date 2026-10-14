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

  // En la esquina de abajo, como en la web: el ojo se vacía en modo privado.
  const titulo = activo ? 'Mostrar importes' : 'Ocultar importes (modo privado)'
  return (
    <button type="button" className="tgl hit" onClick={alternar} title={titulo} aria-pressed={activo}>
      <span className="eye" aria-hidden="true" />{activo ? 'Privado' : 'Visible'}
    </button>
  )
}
