'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLANES_CUSTOM, faltaBrief, planCustom, type Brief, type ProyectoSeguimiento } from '@/lib/seguimiento'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })

// Brief de dirección de una web custom de Arkevo: 2–3 referencias, tono, tipografía y colores si los hay y
// páginas según el plan. Lo lee el agente de custom; sin él, «Comenzar» no crea el encargo.
export default function BriefPanel({ p }: { p: ProyectoSeguimiento }) {
  const router = useRouter()
  const plan = planCustom(p.plan)
  const inicial: Brief = p.brief || { referencias: ['', '', ''], tono: '', tipografia: '', colores: '', paginas: plan ? PLANES_CUSTOM[plan] : '', notas: '' }
  const [b, setB] = useState<Brief>({ ...inicial, referencias: [...inicial.referencias, '', '', ''].slice(0, Math.max(3, inicial.referencias.length)) })
  const [editando, setEditando] = useState(!p.brief)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const set = (c: Partial<Brief>) => setB(x => ({ ...x, ...c }))
  const limpio = { ...b, referencias: b.referencias.map(r => r.trim()).filter(Boolean) }
  const falta = faltaBrief(limpio)

  const guardar = async () => {
    setGuardando(true); setError(''); setHecho('')
    const r = await fetch(`/api/proyectos/${p.id}/brief`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(limpio) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo guardar'); return }
    setHecho(j?.encargo?.ok ? 'Guardado. El agente de custom ya tiene el encargo.' : 'Guardado.')
    setEditando(false); router.refresh()
  }

  if (!editando && p.brief) return (
    <div className="trk__brief">
      <ol>
        <li><span className="caps dim">Brief</span> guardado {p.brief.guardado_en ? fecha(p.brief.guardado_en) : ''} · {p.brief.tono}</li>
        {p.brief.referencias.map(r => <li key={r}><span className="caps dim">Ref.</span> <a href={r} target="_blank" rel="noreferrer">{r}</a></li>)}
        {p.brief.tipografia && <li><span className="caps dim">Tipografía</span> {p.brief.tipografia}</li>}
        {p.brief.colores && <li><span className="caps dim">Colores</span> {p.brief.colores}</li>}
        <li><span className="caps dim">Páginas</span> {p.brief.paginas}</li>
        {p.brief.notas && <li><span className="caps dim">Notas</span> {p.brief.notas}</li>}
      </ol>
      {hecho && <span className="nota ok">{hecho}</span>}
      <span><button type="button" className="copy caps" onClick={() => setEditando(true)}>Editar brief</button></span>
    </div>
  )

  return (
    <div className="trk__brief" aria-label="Brief de dirección">
      <p className="label caps"><span>Brief de dirección{p.plan ? ` · ${p.plan}` : ''}</span><i className="rule" /></p>
      <p className="nota">Lo lee el agente antes de proponer la dirección. Referencias de <span className="mono">05 Recursos/referencias-diseno.md</span> u otras.</p>
      {b.referencias.map((r, i) => (
        <div className="field" key={i}>
          <label className="caps" htmlFor={`br-ref-${p.id}-${i}`}>Referencia {i + 1}{i === 2 ? ' (opcional)' : ''}</label>
          <input id={`br-ref-${p.id}-${i}`} type="url" value={r} placeholder="https://…" onChange={e => set({ referencias: b.referencias.map((x, j) => j === i ? e.target.value : x) })} />
        </div>
      ))}
      <div className="field">
        <label className="caps" htmlFor={`br-tono-${p.id}`}>Tono</label>
        <input id={`br-tono-${p.id}`} value={b.tono} onChange={e => set({ tono: e.target.value })} placeholder="p. ej. sobrio, editorial, mucho blanco" />
      </div>
      <div className="modal__par">
        <div className="field">
          <label className="caps" htmlFor={`br-tipo-${p.id}`}>Tipografía (si la tienes)</label>
          <input id={`br-tipo-${p.id}`} value={b.tipografia} onChange={e => set({ tipografia: e.target.value })} />
        </div>
        <div className="field">
          <label className="caps" htmlFor={`br-col-${p.id}`}>Colores (si los tienes)</label>
          <input id={`br-col-${p.id}`} value={b.colores} onChange={e => set({ colores: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label className="caps" htmlFor={`br-pag-${p.id}`}>Páginas</label>
        <textarea id={`br-pag-${p.id}`} rows={2} value={b.paginas} onChange={e => set({ paginas: e.target.value })} />
        {!plan && <p className="nota field__nota aviso">El proyecto no tiene plan Esencial, Estudio o Signature: escribe las páginas a mano.</p>}
      </div>
      <div className="field">
        <label className="caps" htmlFor={`br-notas-${p.id}`}>Notas (opcional)</label>
        <textarea id={`br-notas-${p.id}`} rows={2} value={b.notas} onChange={e => set({ notas: e.target.value })} />
      </div>
      {(error || falta) && <p className={`nota ${error ? 'error' : 'aviso'}`}>{error || falta}</p>}
      <div className="modal__foot">
        {p.brief && <button type="button" className="copy caps" onClick={() => setEditando(false)}>Cancelar</button>}
        <button type="button" className="pill pill--sm" disabled={!!falta || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : p.fase === 'comenzado' && !p.agente ? 'Guardar y encargar al agente' : 'Guardar brief'}
        </button>
      </div>
    </div>
  )
}
