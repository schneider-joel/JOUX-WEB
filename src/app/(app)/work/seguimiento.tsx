'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ETIQUETA_FASE, FASES_PROYECTO, type FaseProyecto } from '@/lib/leads'
import { AHORA, DIAS_ALERTA, antesDeComenzar, diasDesde, fasesDe, type ProyectoSeguimiento } from '@/lib/seguimiento'
import { EMAIL_RECORDATORIO } from '@/lib/emails'

const dias = (n: number) => n === 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`

// Lo que te toca en un proyecto, en dos o tres palabras (el detalle y los botones están en su ficha).
function queToca(p: ProyectoSeguimiento, parado: boolean): string | null {
  if (p.borradores.length) return p.borradores.length === 1 ? 'Email por enviar' : `${p.borradores.length} emails por enviar`
  if (p.agente?.estado === 'error') return 'El agente no pudo terminar'
  if (p.agente?.estado === 'lista' && p.fase === 'comenzado') return 'Revisar lo que hizo el agente'
  if (p.fase === 'comenzado' && p.encargo_tipo === 'custom' && !p.agente) return 'Escribir el brief'
  if (antesDeComenzar(p) && p.material_completo) return 'Listo para comenzar'
  if (p.drive_error && !p.drive_url) return 'Drive no se pudo crear'
  if (parado && p.fase && EMAIL_RECORDATORIO[p.fase]) return 'Parado · mandar recordatorio'
  if (!p.fase) return 'Ponle su etapa'
  return null
}

// Work › Proyectos: una fila por proyecto con su línea de etapas. Toda la fila abre la ficha, donde se
// cambia la etapa y está todo lo demás (emails, agente, Drive, brief). Aquí solo se mira y se filtra.
export default function Seguimiento({ proyectos, marcas }: { proyectos: ProyectoSeguimiento[]; marcas: { key: string; nombre: string }[] }) {
  const [marca, setMarca] = useState<string | null>(null)
  const [fase, setFase] = useState<FaseProyecto | 'sin' | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)

  const nombreMarca = new Map(marcas.map(m => [m.key, m.nombre]))
  const conProyectos = marcas.filter(m => proyectos.some(p => p.marca === m.key))
  const deMarca = proyectos.filter(p => !marca || p.marca === marca)
  const cuenta = (f: FaseProyecto | 'sin') => deMarca.filter(p => (p.fase ?? 'sin') === f).length

  const lista = useMemo(() => deMarca
    .filter(p => fase ? (p.fase ?? 'sin') === fase : verCerrados || p.fase !== 'cerrado')
    // Primero los que no tienen etapa; después de la más avanzada a la menos.
    .sort((a, b) => (b.fase ? FASES_PROYECTO.indexOf(b.fase) : 99) - (a.fase ? FASES_PROYECTO.indexOf(a.fase) : 99)),
  [deMarca, fase, verCerrados])

  return (
    <div className="trk trk__ancho">
      <nav className="chips__row" aria-label="Marca">
        <button type="button" className="chip" aria-pressed={!marca} onClick={() => setMarca(null)}><span>Todas</span></button>
        {conProyectos.map(m => (
          <button key={m.key} type="button" className="chip" aria-pressed={marca === m.key} onClick={() => setMarca(marca === m.key ? null : m.key)}><span>{m.nombre}</span></button>
        ))}
      </nav>

      {/* Río: cuántos proyectos hay en cada etapa; un toque filtra */}
      <div className="trk__rio" role="group" aria-label="Etapas">
        {cuenta('sin') > 0 && (
          <button type="button" className="trk__r is-sin" aria-pressed={fase === 'sin'} onClick={() => setFase(fase === 'sin' ? null : 'sin')}>
            <span className="trk__rn">{cuenta('sin')}</span><span className="caps">Sin etapa</span>
          </button>
        )}
        {FASES_PROYECTO.map((f, i) => (
          <button key={f} type="button" className="trk__r" aria-pressed={fase === f} data-vacio={cuenta(f) === 0 || undefined} onClick={() => setFase(fase === f ? null : f)}>
            <span className="trk__rn">{cuenta(f)}</span><span className="caps"><span className="dim">{i + 1}</span> {ETIQUETA_FASE[f]}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? <p className="empty">{proyectos.length ? 'Ningún proyecto en esta etapa.' : 'No hay proyectos en marcha. Aparecen al marcar un lead como ganado o al crear una web en Webs.'}</p> : (
        <ul className="trk__lista">
          {lista.map(p => {
            const idx = p.fase ? FASES_PROYECTO.indexOf(p.fase) : -1
            const propias = fasesDe(p.marca)
            const d = diasDesde(p.desde), limite = p.fase ? DIAS_ALERTA[p.fase] : null
            const parado = limite != null && d >= limite
            const toca = queToca(p, parado)
            return (
              <li key={p.id}>
                <Link href={`/proyectos/${p.id}`} className={`trk__p trk__fila${parado ? ' is-parado' : ''}${!p.fase ? ' is-sin' : ''}`}>
                  <span className="trk__q">
                    <span className="trk__c">{p.cliente}</span>
                    <span className="trk__n">{p.nombre}</span>
                    <span className="caps trk__m">{nombreMarca.get(p.marca || '') || p.marca || 'Sin marca'}</span>
                  </span>

                  <span className="trk__linea" aria-hidden="true" style={{ ['--p' as string]: idx < 0 ? 0 : idx / (FASES_PROYECTO.length - 1) }}>
                    {FASES_PROYECTO.map((f, i) => <span key={f} className={`trk__nodo${!propias.includes(f) ? ' is-salta' : i < idx ? ' is-hecho' : i === idx ? ' is-ahora' : ''}`} />)}
                  </span>

                  <span className="trk__ahora">
                    <span className="trk__fase">{p.fase ? ETIQUETA_FASE[p.fase] : 'Sin etapa'}{p.fase && <span className={`caps ${parado ? 'aviso' : 'dim'}`}> · {parado ? `parado ${d} d` : dias(d)}</span>}</span>
                    {toca ? <span className="trk__toca"><i aria-hidden="true" />{toca}</span> : <span className="trk__que">{p.fase ? AHORA[p.fase] : ''}</span>}
                  </span>
                  <span className="trk__ir" aria-hidden="true">›</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {!fase && cuenta('cerrado') > 0 && (
        <button type="button" className="copy caps trk__cerrados" onClick={() => setVerCerrados(!verCerrados)}>
          {verCerrados ? 'Ocultar cerrados' : `Ver ${cuenta('cerrado')} cerrado${cuenta('cerrado') === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}
