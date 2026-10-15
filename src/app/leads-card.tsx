'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { hace } from '@/lib/leads'

// Leads nuevos sin atender (estado «nuevo»), de todas las marcas. Abre el Pipeline.
// Se carga aparte del resto del Overview: si falla, la tarjeta no sale y nada más se rompe.
type Nuevo = { id: number; marca_nombre: string; nombre: string | null; email: string; empresa: string | null; recibido_en: string }

export default function LeadsCard() {
  const [nuevos, setNuevos] = useState<Nuevo[] | null>(null)
  useEffect(() => {
    fetch('/api/leads').then(r => r.ok ? r.json() : null).then(j => { if (j) setNuevos(j.nuevos) }).catch(() => {})
  }, [])
  if (!nuevos) return null

  return (
    <section className="block" aria-label="Leads">
      <p className="label caps">
        <span>Leads{nuevos.length ? ` · ${nuevos.length} nuevo${nuevos.length === 1 ? '' : 's'}` : ''}</span><i className="rule" />
        <Link href="/pipeline" className="label__m copy">Pipeline →</Link>
      </p>
      {nuevos.length === 0 ? <p className="nota">No hay leads nuevos sin atender.</p> : (
        <ul className="list focus">
          {nuevos.slice(0, 5).map(l => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="fila pipe__lead">
                <i className="dot dot--amber" aria-hidden="true" />
                <span className="fila__main">
                  <span className="fila__t">{l.nombre || l.email}{l.empresa ? <span> · {l.empresa}</span> : null}</span>
                  <span className="fila__s caps">{l.marca_nombre} · {hace(l.recibido_en)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
