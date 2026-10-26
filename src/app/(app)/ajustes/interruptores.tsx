'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type Cifras = { tal_cual: number; editados: number; auto: number }

const guardar = (cuerpo: Record<string, unknown>) =>
  fetch('/api/ajustes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    .then(async r => r.ok ? null : ((await r.json().catch(() => ({}))).error || 'No se pudo guardar'))
    .catch(() => 'No se pudo guardar')

// Una plantilla o una categoría: nombre, cifras para decidir y el interruptor. Encender pide confirmación.
export function Interruptor({ tipo, titulo, cifras, activo, aviso, ...ids }: {
  tipo: 'plantilla' | 'categoria'; titulo: string; cifras: Cifras; activo: boolean; aviso?: string
  clave?: string; marca: string; categoria?: string
}) {
  const router = useRouter()
  const [on, setOn] = useState(activo)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const total = cifras.tal_cual + cifras.editados

  const cambiar = async () => {
    const nuevo = !on
    if (nuevo && !confirm(`«${titulo}» saldrá sin que lo apruebes. ${total ? `Hasta ahora: ${cifras.tal_cual} de ${total} enviados sin tocar.` : 'Aún no hay envíos para comparar.'} ¿Encender?`)) return
    setOcupado(true); setError('')
    const e = await guardar({ tipo, activo: nuevo, ...ids })
    setOcupado(false)
    if (e) { setError(e); return }
    setOn(nuevo); router.refresh()
  }

  return (
    <div className="fila">
      <span className="fila__main">
        <span className="fila__t">{titulo}</span>
        <span className="fila__s caps">
          {total ? `${cifras.tal_cual} sin tocar · ${cifras.editados} editado${cifras.editados === 1 ? '' : 's'}` : 'Sin envíos todavía'}
          {cifras.auto ? ` · ${cifras.auto} automático${cifras.auto === 1 ? '' : 's'}` : ''}
          {aviso ? ` · ${aviso}` : ''}
        </span>
        {error && <span className="nota error">{error}</span>}
      </span>
      <button type="button" className="chip" aria-pressed={on} disabled={ocupado} onClick={cambiar}>
        <span>{on ? 'Automático' : 'Apagado'}</span>
      </button>
    </div>
  )
}

// Pausa de emergencia: corta las plantillas automáticas y las respuestas de IA a la vez (pasan a borrador).
export function Pausa({ activo }: { activo: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(activo)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const cambiar = async () => {
    setOcupado(true); setError('')
    const e = await guardar({ tipo: 'pausa', activo: !on })
    setOcupado(false)
    if (e) { setError(e); return }
    setOn(!on); router.refresh()
  }
  return (
    <div className="ajustes__pausa">
      <p className={`nota${on ? ' aviso' : ''}`}>
        {on ? 'Pausados: todo lo que saldría solo se queda como borrador hasta que lo reanudes.' : 'Lo que esté en «Automático» abajo sale sin tu aprobación y queda marcado como «enviado automáticamente».'}
      </p>
      <button type="button" className={on ? 'pill pill--sm' : 'ghost'} disabled={ocupado} onClick={cambiar}>
        {on ? 'Reanudar los envíos automáticos' : 'Pausar todos los envíos automáticos'}
      </button>
      {error && <p className="nota error">{error}</p>}
    </div>
  )
}

export function ResumenAhora() {
  const router = useRouter()
  const [estado, setEstado] = useState<'' | 'enviando' | 'ok'>('')
  const [msg, setMsg] = useState('')
  const enviar = async () => {
    setEstado('enviando'); setMsg('')
    const r = await fetch('/api/resumen', { method: 'POST' }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    if (!r?.ok) { setEstado(''); setMsg(j?.error || 'No se pudo enviar'); return }
    setEstado('ok')
    setMsg(`Enviado: «${j.asunto}». Push a ${j.push} dispositivo${j.push === 1 ? '' : 's'}.`)
    router.refresh()
  }
  return (
    <div className="ajustes__pausa">
      <button type="button" className="ghost" disabled={estado === 'enviando'} onClick={enviar}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviar resumen ahora'}
      </button>
      {msg && <p className={`nota${estado === 'ok' ? ' ok' : ' error'}`}>{msg}</p>}
    </div>
  )
}

// Un paso del piloto automático en una marca (rediseño comercial): encender pide confirmación.
export function PasoPilotoInterruptor({ marca, paso, titulo, detalle, activo }: { marca: string; paso: string; titulo: string; detalle: string; activo: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(activo)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const cambiar = async () => {
    const nuevo = !on
    if (nuevo && !confirm(`«${titulo}» pasará solo, sin preguntarte. ¿Encender?`)) return
    setOcupado(true); setError('')
    const e = await guardar({ tipo: 'piloto', marca, paso, activo: nuevo })
    setOcupado(false)
    if (e) { setError(e); return }
    setOn(nuevo); router.refresh()
  }
  return (
    <div className="fila">
      <span className="fila__main">
        <span className="fila__t">{titulo}</span>
        <span className="fila__s">{detalle}</span>
        {error && <span className="nota error">{error}</span>}
      </span>
      <button type="button" className="chip" aria-pressed={on} disabled={ocupado} onClick={cambiar}>
        <span>{on ? 'Automático' : 'Apagado'}</span>
      </button>
    </div>
  )
}
