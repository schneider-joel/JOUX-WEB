'use client'

import { useState } from 'react'

// «Copiar enlace» del presupuesto dentro de la caja de la ficha, mientras se espera a que el cliente acepte.
export default function CopiarEnlace({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => { await navigator.clipboard.writeText(enlace).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 1600) }
  return <button type="button" className="pill pill--sm" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
}
