'use client'

import { useCallback, useEffect, useState } from 'react'
import { deudaDe, saldo, type GastoCompartido, type Persona } from '@/lib/compartidos'

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fechaCorta = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const mesDe = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
const CATEGORIAS = ['Alquiler', 'Agua', 'Luz', 'Supermercado', 'Casa', 'Salidas', 'Viajes', 'Otros']

const campo: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }

type Datos = { quien: Persona; pareja: string; gastos: GastoCompartido[]; token?: string }
type Borrador = { tipo: 'gasto' | 'liquidacion'; fecha: string; concepto: string; importe: string; pagador: Persona; reparto: 'mitad' | 'otro'; categoria: string }

// Vista de la cuenta compartida. La usan el hub (Joel, con su cookie) y el
// link privado de la pareja (con su token).
export default function CompartidosVista({ token }: { token?: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/compartidos${qs}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ error: 'Sin conexión' }))
    if (r.error) setError(r.error); else setDatos(r)
  }, [qs])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>{error === 'No autorizado' ? 'Este link no es válido.' : error}</div>
  if (!datos) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Cargando…</div>

  const yo = datos.quien
  const otro: Persona = yo === 'joel' ? 'pareja' : 'joel'
  const nombre = (p: Persona) => (p === yo ? 'Tú' : p === 'joel' ? 'Joel' : datos.pareja)
  const sujeto = (p: Persona) => (p === yo ? 'tú' : nombre(p))
  const paraQuien = (p: Persona) => (p === yo ? 'ti' : nombre(p))
  const elOtroDe = (p: Persona): Persona => (p === 'joel' ? 'pareja' : 'joel')
  const nombreOtro = nombre(otro)
  // Saldo desde quien mira: positivo = el otro te debe.
  const s = saldo(datos.gastos) * (yo === 'joel' ? 1 : -1)
  const efecto = (g: GastoCompartido) => (g.pagador === yo ? 1 : -1) * (g.tipo === 'liquidacion' ? Number(g.importe) : deudaDe(g))

  const nuevoGasto = () => setBorrador({ tipo: 'gasto', fecha: hoy(), concepto: '', importe: '', pagador: yo, reparto: 'mitad', categoria: '' })
  const saldar = () => setBorrador({ tipo: 'liquidacion', fecha: hoy(), concepto: `Saldo de cuentas`, importe: Math.abs(s).toFixed(2), pagador: s > 0 ? otro : yo, reparto: 'mitad', categoria: '' })

  const guardar = async () => {
    if (!borrador) return
    setGuardando(true)
    const r = await fetch('/api/compartidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...borrador, token }) }).then(r => r.json())
    setGuardando(false)
    if (r.error) { alert(r.error); return }
    setBorrador(null)
    cargar()
  }
  const borrar = async (g: GastoCompartido) => {
    if (!confirm(`¿Borrar "${g.concepto}" (${eur(Number(g.importe))})?`)) return
    const r = await fetch(`/api/compartidos?id=${g.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`, { method: 'DELETE' }).then(r => r.json())
    if (r.error) alert(r.error); else cargar()
  }
  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/c/${datos.token}`).catch(() => {})
    setCopiado(true); setTimeout(() => setCopiado(false), 1800)
  }

  const porMes = new Map<string, GastoCompartido[]>()
  for (const g of datos.gastos) porMes.set(g.fecha.slice(0, 7), [...(porMes.get(g.fecha.slice(0, 7)) || []), g])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ textAlign: 'center', padding: '26px 20px' }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {Math.abs(s) < 0.01 ? 'Estáis en paz' : s > 0 ? `${nombreOtro} te debe` : `Le debes a ${nombreOtro}`}
        </div>
        <div className="mono" style={{ fontSize: 34, fontWeight: 500, marginTop: 6, color: Math.abs(s) < 0.01 ? 'var(--text2)' : s > 0 ? 'var(--green)' : 'var(--amber)' }}>{eur(Math.abs(s))}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={nuevoGasto}>+ Añadir gasto</button>
          {Math.abs(s) >= 0.01 && <button className="btn" onClick={saldar}>Saldar cuenta</button>}
          {datos.token && <button className="btn btn-ghost" onClick={copiarLink}>{copiado ? '✓ Link copiado' : `Copiar link para ${datos.pareja}`}</button>}
        </div>
      </div>

      {borrador && (
        <div className="card">
          <div className="card-head"><div className="card-title">{borrador.tipo === 'liquidacion' ? 'Saldar cuenta' : 'Nuevo gasto'}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={etiqueta}>{borrador.tipo === 'liquidacion' ? 'Quién transfiere' : 'Quién pagó'}</label>
              <select value={borrador.pagador} onChange={e => setBorrador({ ...borrador, pagador: e.target.value as Persona })} style={campo}>
                <option value={yo}>Tú</option>
                <option value={otro}>{nombreOtro}</option>
              </select>
            </div>
            <div>
              <label style={etiqueta}>Importe (€)</label>
              <input type="number" inputMode="decimal" step="0.01" value={borrador.importe} onChange={e => setBorrador({ ...borrador, importe: e.target.value })} placeholder="0,00" style={campo} autoFocus />
            </div>
            <div>
              <label style={etiqueta}>Fecha</label>
              <input type="date" value={borrador.fecha} onChange={e => setBorrador({ ...borrador, fecha: e.target.value })} style={campo} />
            </div>
          </div>
          {borrador.tipo === 'gasto' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
              <div>
                <label style={etiqueta}>Concepto</label>
                <input value={borrador.concepto} onChange={e => setBorrador({ ...borrador, concepto: e.target.value })} placeholder="Ej: Compra Mercadona" style={campo} />
              </div>
              <div>
                <label style={etiqueta}>Para quién</label>
                <select value={borrador.reparto} onChange={e => setBorrador({ ...borrador, reparto: e.target.value as 'mitad' | 'otro' })} style={campo}>
                  <option value="mitad">A medias</option>
                  <option value="otro">Todo para {borrador.pagador === yo ? nombreOtro : 'ti'}</option>
                </select>
              </div>
              <div>
                <label style={etiqueta}>Categoría (opcional)</label>
                <select value={borrador.categoria} onChange={e => setBorrador({ ...borrador, categoria: e.target.value })} style={campo}>
                  <option value="">—</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}
          {Number(borrador.importe) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>
              {borrador.tipo === 'liquidacion'
                ? `${borrador.pagador === yo ? 'Tú le pasas' : `${nombreOtro} te pasa`} ${eur(Number(borrador.importe))}.`
                : `${borrador.pagador === yo ? `${nombreOtro} te debe` : `Le debes a ${nombreOtro}`} ${eur(borrador.reparto === 'otro' ? Number(borrador.importe) : Number(borrador.importe) / 2)} por este gasto.`}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={() => setBorrador(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={guardando || !(Number(borrador.importe) > 0) || (borrador.tipo === 'gasto' && !borrador.concepto.trim())} onClick={guardar} style={{ flex: 1, justifyContent: 'center' }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><div className="card-title">Movimientos</div></div>
        {datos.gastos.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>Todavía no hay gastos. {yo === 'joel' ? 'Tus pagos del alquiler y el agua' : 'Los pagos del alquiler y el agua de Joel'} se añaden solos desde el banco.</div>}
        {Array.from(porMes.entries()).map(([mes, gs]) => (
          <div key={mes} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 4px' }}>{mesDe(gs[0].fecha)}</div>
            {gs.map(g => {
              const e = efecto(g)
              const puedeBorrar = yo === 'joel' || g.creado_por === yo
              return (
                <div key={g.id} className="row">
                  <div style={{ width: 50, fontSize: 11.5, color: 'var(--text3)', flexShrink: 0 }}>{fechaCorta(g.fecha)}</div>
                  <div className="row-main">
                    <div className="row-title">{g.tipo === 'liquidacion' ? `💸 ${g.concepto}` : g.concepto}</div>
                    <div className="row-sub">
                      {g.tipo === 'liquidacion'
                        ? `${nombre(g.pagador)} → ${paraQuien(elOtroDe(g.pagador))}`
                        : `Pagó ${sujeto(g.pagador)} ${eur(Number(g.importe))} · ${g.reparto === 'mitad' ? 'a medias' : `todo para ${paraQuien(elOtroDe(g.pagador))}`}`}
                      {g.movimiento_id && ' · del banco'}
                    </div>
                  </div>
                  <div className="row-side">
                    <span className="row-amount" style={{ color: e > 0 ? 'var(--green)' : 'var(--amber)' }}>{e > 0 ? '+' : '−'}{eur(Math.abs(e))}</span>
                    {puedeBorrar && <button className="icon-btn danger" onClick={() => borrar(g)} title="Borrar">×</button>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
          Verde: te lo deben a ti. Ámbar: lo debes tú.
        </div>
      </div>
    </div>
  )
}
