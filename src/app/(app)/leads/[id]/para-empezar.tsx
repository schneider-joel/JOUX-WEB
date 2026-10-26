'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PARA_EMPEZAR, type ParaEmpezar } from '@/lib/leads'

// «Para empezar» (rediseño comercial, fase 3): lo que el cliente tiene que mandar antes de ganar el lead.
// La IA lo marca al leer cada respuesta; un toque lo marca o desmarca a mano.
export default function ParaEmpezarLista({ leadId, marca, valor }: { leadId: number; marca: string; valor: ParaEmpezar }) {
  const router = useRouter()
  const [pe, setPe] = useState<ParaEmpezar>(valor)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const items = PARA_EMPEZAR[marca] || []

  const cambiar = async (clave: string) => {
    const ok = !pe[clave]?.ok
    setOcupado(clave); setError('')
    const r = await fetch(`/api/leads/${leadId}/para-empezar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, ok }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(j?.error || 'No se pudo guardar'); return }
    setPe(j.para_empezar); router.refresh()
  }

  return (
    <>
      <ul className="pe">
        {items.map(i => {
          const v = pe[i.clave]
          return (
            <li key={i.clave}>
              <button type="button" className={`pe__i${v?.ok ? ' is-ok' : ''}`} disabled={ocupado === i.clave} onClick={() => cambiar(i.clave)} aria-pressed={!!v?.ok}>
                <span className="pe__c" aria-hidden="true">{v?.ok ? '✓' : ''}</span>
                <span>{i.texto}</span>
                {v && <span className="caps dim">{v.por === 'ia' ? 'IA' : 'tú'}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p className="nota error">{error}</p>}
    </>
  )
}
