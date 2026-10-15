'use client'

import { useMemo } from 'react'
import { totalACobrar } from '@/lib/importes'
import type { Marca } from '@/lib/marcas'

// Ingresos por marca: cobrado y pendiente de cobro del año, con el importe real que paga el
// cliente (IVA y retención incluidos si es de España). La marca sale solo de la columna
// `marca` de facturas o, si no la tiene (las que crea el trigger desde un timesheet), de la de su
// proyecto. Las que no tienen ninguna van a «Sin marca».
type F = { id: number; cliente: string; importe: number; fecha: string; estado: string; tipo_factura?: string | null; marca?: string | null; fiscal?: boolean | null }

// Con el € delante, como el resto del hub (mismas cifras y decimales).
const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)
const MODO_TXT = { cerrado: 'webs · precio cerrado', dia: 'por día', hora: 'por hora' }

type F2 = F & { proyecto_id?: number | null }
export default function MarcaCard({ facturas, proyectos, marcas, demo }: { facturas: F2[]; proyectos: { id: number; marca?: string | null }[]; marcas: Marca[]; demo: boolean }) {
  const anio = new Date().getFullYear()

  const filas = useMemo(() => {
    const acc = new Map<string, { cobrado: number; pendiente: number; n: number }>(marcas.map(m => [m.key, { cobrado: 0, pendiente: 0, n: 0 }]))
    for (const f of facturas) {
      if (f.fiscal === false) continue                       // registros internos (timesheet), no son facturas declaradas
      if (!f.fecha || new Date(f.fecha + 'T00:00:00').getFullYear() !== anio) continue
      const k = f.marca || proyectos.find(p => p.id === f.proyecto_id)?.marca || ''
      if (!acc.has(k)) acc.set(k, { cobrado: 0, pendiente: 0, n: 0 })
      const fila = acc.get(k)!
      const total = totalACobrar(f)
      if (f.estado === 'cobrada') fila.cobrado += total; else fila.pendiente += total
      fila.n += 1
    }
    return Array.from(acc.entries())
  }, [facturas, proyectos, marcas, anio])

  // Una fila por marca: nombre, una línea pequeña con lo cobrado y lo pendiente, y el total.
  // Cómo se factura cada una (por hora, por día…) queda en el título, al pasar por encima.
  return (
    <section className="block" aria-label="Ingresos por marca" title={`${anio} · importe a cobrar, con IVA y retención`}>
      <p className="label caps"><span>Por marca</span><i className="rule" /><span className="label__m">{demo && <span className="aviso">Demo · </span>}{anio}</span></p>
      <ul className="list focus">
        {filas.map(([key, v]) => {
          const m = marcas.find(x => x.key === key)
          const total = v.cobrado + v.pendiente
          const nota = m ? '' : key ? 'no está en marcas · ' : 'por asignar · '
          return (
            <li key={key || 'sin'} className="fila" title={m ? MODO_TXT[m.modo] : undefined}>
              <div className="fila__main">
                <span className={`fila__t${total ? '' : ' is-vacia'}`}>{m?.nombre || (key ? key : 'Sin marca')}</span>
                <span className="fila__s caps" title={total ? `Cobrado ${eur(v.cobrado)} · pendiente ${eur(v.pendiente)}` : undefined}>{nota}{total ? `cobrado ${eur(v.cobrado)} · pendiente ${eur(v.pendiente)}` : 'sin facturas'}</span>
              </div>
              <span className="num">{total ? eur(total) : '—'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
