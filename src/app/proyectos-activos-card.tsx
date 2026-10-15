'use client'

import Link from 'next/link'

// Proyectos en marcha (status «activo») de todas las marcas: para quién es cada uno y cuánto vale.
// Cada fila abre la pestaña de su marca con el proyecto desplegado. Mismo estilo que la tarjeta «Leads».
export type ProyectoActivo = {
  id: number
  nombre: string          // agencias: la web; treatments: el nombre del proyecto
  cliente: string         // cliente fiscal
  marca: string           // nombre visible de la marca
  importe: number | null  // base sin IVA: precio cerrado (webs) o lo que llevan los días (treatments)
  cerrado: boolean        // true = precio cerrado
  conFiscales: boolean    // el cliente tiene datos fiscales guardados
}

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.round(n))

export default function ProyectosActivosCard({ proyectos, onAbrir }: { proyectos: ProyectoActivo[]; onAbrir: (id: number) => void }) {
  return (
    <section className="block" aria-label="Proyectos activos">
      <p className="label caps">
        <span>Proyectos activos{proyectos.length ? ` · ${proyectos.length}` : ''}</span><i className="rule" />
        <Link href="/proyectos" className="label__m copy">Seguimiento →</Link>
      </p>
      {proyectos.length === 0 ? <p className="nota">No hay proyectos activos.</p> : (
        <ul className="list focus">
          {proyectos.map(p => (
            <li key={p.id}>
              <button type="button" className="fila fila--btn pipe__lead" onClick={() => onAbrir(p.id)}>
                <i className="dot dot--green" aria-hidden="true" />
                <span className="fila__main">
                  <span className="fila__t">{p.cliente}{p.nombre && p.nombre !== p.cliente ? <span> · {p.nombre}</span> : null}</span>
                  <span className="fila__s caps">{p.marca}{!p.conFiscales && <> · <span className="aviso">Sin datos fiscales</span></>}</span>
                </span>
                {p.importe ? <span className="num" title={p.cerrado ? 'Precio cerrado, base sin IVA' : 'Lo que llevan los días, base sin IVA'}>€{fmt(p.importe)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
