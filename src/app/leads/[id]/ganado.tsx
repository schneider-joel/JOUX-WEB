'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Lead } from '@/lib/leads'
import type { Marca } from '@/lib/marcas'
import { PAISES, type PaisFiscal } from '@/lib/clientes'
import { faltaGanado, filasGanado, formInicial, nombreProyecto, sugerirPais, type ClienteFiscal, type FormGanado } from '@/lib/ganado'
import { desglose } from '@/lib/importes'

type LeadProps = Pick<Lead, 'id' | 'estado' | 'nombre' | 'email' | 'empresa' | 'pais' | 'idioma' | 'interes'>
type MarcaProps = Pick<Marca, 'key' | 'nombre' | 'modo'>

const eur = (n: number) => '€' + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)
const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const celda = (v: unknown) => v == null ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v)

// Una fila como la verá la base de datos: columna → valor (NULL incluido), para la vista previa.
function Fila({ titulo, fila }: { titulo: string; fila: Record<string, unknown> }) {
  return (
    <div className="block" style={{ gap: 8 }}>
      <p className="caps" style={{ color: 'var(--muted)' }}>{titulo}</p>
      <dl className="meta lead__meta">
        {Object.entries(fila).map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd className="mono">{celda(v)}</dd></div>)}
      </dl>
    </div>
  )
}

// Ganado / perdido desde la ficha del lead. Ganado: formulario → vista previa de las filas → «Crear».
export default function AccionesLead({ lead, marca, clientes }: { lead: LeadProps; marca: MarcaProps; clientes: ClienteFiscal[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<null | 'ganado' | 'perdido'>(null)
  const [revisando, setRevisando] = useState(false)
  const [form, setForm] = useState<FormGanado>(() => formInicial(lead, marca))
  const [nombreTocado, setNombreTocado] = useState(false)
  const [paisTocado, setPaisTocado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const web = marca.modo === 'cerrado'
  const set = (cambios: Partial<FormGanado>) => setForm(f => {
    const n = { ...f, ...cambios }
    if (!nombreTocado && cambios.cliente !== undefined) n.nombre = nombreProyecto(n.cliente.trim() || '…', marca)
    if (!paisTocado && !n.existente && (cambios.identificador !== undefined || cambios.direccion !== undefined)) n.pais = sugerirPais(n.identificador, n.direccion, lead.pais)
    return n
  })
  const elegirExistente = (nombre: string) => {
    const c = clientes.find(x => x.cliente === nombre)
    const base = formInicial(lead, marca, c)
    setForm(f => ({ ...base, nombre: nombreTocado ? f.nombre : base.nombre, web: f.web, plan: f.plan, precio: f.precio, tarifa_dia: f.tarifa_dia }))
  }
  const falta = faltaGanado(form, marca)
  const filas = filasGanado(lead as Lead, marca, form)
  const sugerido = sugerirPais(form.identificador, form.direccion, lead.pais)

  const cerrar = () => { setAbierto(null); setRevisando(false); setError('') }
  const crear = async () => {
    setOcupado(true); setError('')
    const r = await fetch(`/api/leads/${lead.id}/ganado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setOcupado(false)
    if (!r?.ok) { setError(j?.error || 'No se pudo crear'); return }
    cerrar(); router.refresh()
  }
  const perder = async () => {
    setOcupado(true); setError('')
    const r = await fetch(`/api/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'perdido', motivo }) }).catch(() => null)
    setOcupado(false)
    if (!r?.ok) { setError('No se pudo guardar'); return }
    cerrar(); router.refresh()
  }

  if (!abierto) return (
    <div className="header-actions" style={{ gap: 12, flexWrap: 'wrap' }}>
      <button type="button" className="pill pill--sm" onClick={() => setAbierto('ganado')}>Marcar ganado</button>
      {lead.estado !== 'perdido' && <button type="button" className="ghost" onClick={() => setAbierto('perdido')}>Marcar perdido</button>}
    </div>
  )

  if (abierto === 'perdido') return (
    <section className="block" aria-label="Marcar perdido">
      <p className="label caps"><span>Marcar perdido</span><i className="rule" /></p>
      <div className="field">
        <label className="caps" htmlFor="lp-motivo">Motivo (opcional)</label>
        <textarea id="lp-motivo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Precio, plazos, no responde…" />
      </div>
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={cerrar}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={ocupado} onClick={perder}>{ocupado ? 'Guardando…' : 'Marcar perdido'}</button>
      </div>
    </section>
  )

  if (revisando) return (
    <section className="block" aria-label="Vista previa">
      <p className="label caps"><span>Se va a escribir esto</span><i className="rule" /></p>
      {filas.clienteFiscal
        ? <Fila titulo="INSERT clientes_fiscales" fila={filas.clienteFiscal} />
        : <p className="nota">Cliente existente: {form.cliente} (no se escribe en clientes_fiscales).</p>}
      <Fila titulo="INSERT proyectos (id lo pone la base de datos)" fila={filas.proyecto} />
      <Fila titulo={`UPDATE leads WHERE id = ${lead.id}`} fila={{ estado: 'ganado', proyecto_id: '<id del proyecto nuevo>' }} />
      <Fila titulo="INSERT eventos" fila={{ lead_id: lead.id, proyecto_id: '<id del proyecto nuevo>', tipo: filas.evento.tipo, fuente: filas.evento.fuente, datos: JSON.stringify({ ...filas.evento.datos, de: lead.estado }) }} />
      {web && form.precio ? <p className="nota mono">Después podrás facturar el pago 1: {eur(form.precio / 2)} base{form.pais === 'ES' ? ` · ${eur(desglose(Number(form.precio) / 2, true)!.total)} a cobrar` : ''}.</p> : null}
      {error && <p className="nota error">{error}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={() => setRevisando(false)}>← Volver</button>
        <button type="button" className="pill pill--sm" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear'}</button>
      </div>
    </section>
  )

  return (
    <section className="block" aria-label="Marcar ganado">
      <p className="label caps"><span>Marcar ganado · {marca.nombre}</span><i className="rule" /></p>
      <div className="modal__campos">
        <div className="chips__row" role="group" aria-label="Cliente">
          <button type="button" className="chip" aria-pressed={!form.existente} onClick={() => setForm(formInicial(lead, marca))}><span>Cliente nuevo</span></button>
          <button type="button" className="chip" aria-pressed={form.existente} disabled={!clientes.length} onClick={() => elegirExistente(clientes[0]?.cliente)}><span>Ya está en Clientes</span></button>
        </div>

        {form.existente ? (
          <div className="field">
            <label className="caps" htmlFor="lg-existente">Cliente fiscal</label>
            <span className="field__sel">
              <select id="lg-existente" value={form.cliente} onChange={e => elegirExistente(e.target.value)}>
                {clientes.map(c => <option key={c.cliente} value={c.cliente}>{c.cliente}{c.pais ? ` · ${c.pais}` : ''}</option>)}
              </select>
              <Chevron />
            </span>
            {!clientes.find(c => c.cliente === form.cliente)?.pais && <p className="nota aviso field__nota">Sin país fiscal en su ficha: no se podrá facturar hasta completarlo en Clientes.</p>}
          </div>
        ) : (
          <>
            <div className="modal__par">
              <div className="field">
                <label className="caps" htmlFor="lg-cliente">Nombre fiscal</label>
                <input id="lg-cliente" value={form.cliente} onChange={e => set({ cliente: e.target.value })} />
              </div>
              <div className="field">
                <label className="caps" htmlFor="lg-nif">NIF / CIF</label>
                <input id="lg-nif" value={form.identificador} onChange={e => set({ identificador: e.target.value })} placeholder="B12345678" />
              </div>
            </div>
            <div className="field">
              <label className="caps" htmlFor="lg-dir">Dirección</label>
              <textarea id="lg-dir" rows={2} value={form.direccion} onChange={e => set({ direccion: e.target.value })} placeholder={'Calle, número\nCiudad, país'} />
            </div>
            <div className="field">
              <label className="caps" htmlFor="lg-pais">País fiscal</label>
              <span className="field__sel">
                <select id="lg-pais" value={form.pais} onChange={e => { setPaisTocado(true); set({ pais: e.target.value as PaisFiscal }) }}>
                  {PAISES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <Chevron />
              </span>
              <p className={`nota field__nota${form.pais !== sugerido ? ' aviso' : ''}`}>
                {form.pais === sugerido ? 'Sugerido por NIF, dirección o país del formulario.' : `La sugerencia era ${sugerido}.`}
                {form.pais === 'UE' ? ' UE: no se puede facturar hasta el alta en el ROI.' : ''}
              </p>
            </div>
          </>
        )}

        <div className="field">
          <label className="caps" htmlFor="lg-nombre">Proyecto</label>
          <input id="lg-nombre" value={form.nombre} onChange={e => { setNombreTocado(true); set({ nombre: e.target.value }) }} />
        </div>
        {web ? (
          <>
            <div className="field">
              <label className="caps" htmlFor="lg-web">Web (opcional)</label>
              <input id="lg-web" value={form.web} onChange={e => set({ web: e.target.value })} placeholder="estudio.es" />
            </div>
            <div className="modal__par">
              <div className="field">
                <label className="caps" htmlFor="lg-plan">Plan</label>
                <input id="lg-plan" list="lg-planes" value={form.plan} onChange={e => set({ plan: e.target.value })} placeholder="Opcional" />
                {marca.key === 'arkevo' && <datalist id="lg-planes">{['Essential', 'Studio', 'Signature'].map(x => <option key={x} value={x} />)}</datalist>}
              </div>
              <div className="field">
                <label className="caps" htmlFor="lg-precio">Precio cerrado (base)</label>
                <input id="lg-precio" type="number" inputMode="decimal" value={form.precio ?? ''} onChange={e => set({ precio: e.target.value ? Number(e.target.value) : null })} placeholder="990" />
              </div>
            </div>
          </>
        ) : marca.modo === 'dia' ? (
          <div className="field">
            <label className="caps" htmlFor="lg-tarifa">Tarifa por día (base)</label>
            <input id="lg-tarifa" type="number" inputMode="decimal" value={form.tarifa_dia ?? ''} onChange={e => set({ tarifa_dia: e.target.value ? Number(e.target.value) : null })} placeholder="Opcional" />
            <p className="nota field__nota">Queda en la línea de tiempo; cada día del timesheet lleva su propia tarifa.</p>
          </div>
        ) : null}
      </div>
      {falta && <p className="nota aviso">{falta}</p>}
      <div className="modal__foot" style={{ marginTop: 8 }}>
        <button type="button" className="copy caps" onClick={cerrar}>Cancelar</button>
        <button type="button" className="pill pill--sm" disabled={!!falta} onClick={() => setRevisando(true)}>Revisar filas</button>
      </div>
    </section>
  )
}
