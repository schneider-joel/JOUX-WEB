'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, batchQuery, type Cuenta } from '@/lib/supabase'
import MovimientosCard from './movimientos-card'

type Sesion = { session_id: string; aspsp: string; valid_until: string | null; ultimo_sync: string | null; ultimo_error: string | null }
type Saldo = { balance_type: string; name?: string; balance_amount: { amount: string; currency: string } }
type CuentaBanco = { uid: string; session_id: string; aspsp: string; nombre: string | null; iban: string | null; moneda: string | null; cuenta_id: number | null; tipo_saldo: string | null; saldos: Saldo[] | null; actualizado: string | null }
type Aspsp = { name: string; country: string; logo?: string; maximum_consent_validity?: number }

const eur = (n: number, moneda = 'EUR') => new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda || 'EUR' }).format(n)
const hace = (d: string) => {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`
}
const NOMBRES_SALDO: Record<string, string> = { ITAV: 'disponible', CLAV: 'disponible', XPCD: 'previsto', CLBD: 'contable', ITBD: 'contable (intradía)', OPBD: 'apertura' }
const DESTACADOS = /bbva|revolut|wise/i

const btn: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const campo: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', color: 'var(--text)', fontSize: 12, fontFamily: 'Inter, sans-serif', outline: 'none' }

export default function BancosTab({ cuentas, mensaje, reload }: { cuentas: Cuenta[]; mensaje: { ok?: boolean; error?: string } | null; reload: () => void }) {
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBanco[]>([])
  const [version, setVersion] = useState(0)
  const [aspsps, setAspsps] = useState<Aspsp[] | null>(null)
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<string>('')
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const [s, c] = await batchQuery([
      supabase.from('bancos_sesiones').select('session_id,aspsp,valid_until,ultimo_sync,ultimo_error').order('created_at'),
      supabase.from('bancos_cuentas').select('uid,session_id,aspsp,nombre,iban,moneda,cuenta_id,tipo_saldo,saldos,actualizado'),
    ])
    setSesiones(s.data || []); setCuentasBanco(c.data || []); setCargando(false); setVersion(v => v + 1)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const abrirConectar = async () => {
    setEstado('Cargando bancos…')
    const r = await fetch('/api/bancos/aspsps?country=ES').then(r => r.json())
    if (r.error) { setEstado(`No se pudo cargar la lista de bancos: ${r.error}`); return }
    setAspsps(r.aspsps); setEstado('')
  }

  const conectar = async (a: Aspsp) => {
    setEstado(`Abriendo ${a.name}…`)
    const r = await fetch('/api/bancos/conectar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aspsp: a.name, pais: a.country, maxSegundos: a.maximum_consent_validity }) }).then(r => r.json())
    if (r.url) window.location.href = r.url
    else setEstado(`No se pudo iniciar la conexión: ${r.error}`)
  }

  const sincronizar = async () => {
    setEstado('Sincronizando…')
    const r = await fetch('/api/bancos/sincronizar', { method: 'POST' }).then(r => r.json())
    setEstado(r.error ? `Error: ${r.error}` : `${r.cuentas} cuentas y ${r.movimientos} movimientos leídos${r.cobros ? ` · ${r.cobros} cobros enlazados con facturas` : ''}${r.errores?.length ? ` · ${r.errores.join(' · ')}` : ''}`)
    await cargar(); reload()
  }

  const vincular = async (c: CuentaBanco, patch: Partial<CuentaBanco>) => {
    await supabase.from('bancos_cuentas').update(patch).eq('uid', c.uid)
    cargar()
  }

  const desconectar = async (s: Sesion) => {
    if (!confirm(`¿Desconectar ${s.aspsp}? Se borran sus cuentas y movimientos guardados en el hub (no toca nada del banco).`)) return
    await supabase.from('bancos_sesiones').delete().eq('session_id', s.session_id)
    cargar()
  }


  const filtrados = (aspsps || []).filter(a => a.name.toLowerCase().includes(buscar.toLowerCase()))
    .sort((a, b) => Number(DESTACADOS.test(b.name)) - Number(DESTACADOS.test(a.name)) || a.name.localeCompare(b.name))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {mensaje?.ok && <div className="card" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontSize: 13 }}>Banco conectado. Ya puedes elegir qué cuenta del hub actualiza cada una.</div>}
      {mensaje?.error && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>No se pudo conectar: {mensaje.error}</div>}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Bancos conectados</div>
            <div className="card-kicker" style={{ marginTop: 2 }}>Open banking de solo lectura · se sincroniza solo cada mañana</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sesiones.length > 0 && <button className="btn" onClick={sincronizar}>Sincronizar ahora</button>}
            <button className="btn btn-primary" onClick={abrirConectar}>Conectar banco</button>
          </div>
        </div>
        {estado && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>{estado}</div>}

        {aspsps && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar banco (BBVA, Revolut, Wise…)" style={{ ...campo, width: '100%', padding: '8px 10px', marginBottom: 10 }} autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {filtrados.map(a => (
                <button key={a.name} onClick={() => conectar(a)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: 8, padding: 8, textAlign: 'left' }}>
                  {a.logo && <img src={a.logo} alt="" width={20} height={20} style={{ borderRadius: 4, background: '#fff' }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </button>
              ))}
              {filtrados.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ningún banco coincide.</div>}
            </div>
          </div>
        )}

        {!cargando && sesiones.length === 0 && !aspsps && (
          <div style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>
            Todavía no hay bancos conectados. Pulsa <b>Conectar banco</b>, elige el banco y autoriza el acceso desde su app. El permiso dura hasta 180 días; después hay que renovarlo.
          </div>
        )}

        {sesiones.map(s => {
          const dias = s.valid_until ? Math.ceil((new Date(s.valid_until).getTime() - Date.now()) / 864e5) : null
          const propias = cuentasBanco.filter(c => c.session_id === s.session_id)
          return (
            <div key={s.session_id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.aspsp}</div>
                  <div style={{ fontSize: 11, color: dias !== null && dias < 14 ? 'var(--amber)' : 'var(--text3)' }}>
                    {dias === null ? '' : dias <= 0 ? 'Permiso vencido · renuévalo' : `Permiso válido ${dias} días más`}
                    {s.ultimo_sync ? ` · sincronizado ${hace(s.ultimo_sync)}` : ''}
                  </div>
                  {s.ultimo_error && <div style={{ fontSize: 11, color: 'var(--red)' }}>{s.ultimo_error}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {dias !== null && dias < 14 && <button style={btn} onClick={abrirConectar}>Renovar</button>}
                  <button style={btn} onClick={() => desconectar(s)}>Desconectar</button>
                </div>
              </div>
              {propias.map(c => {
                const saldos = c.saldos || []
                return (
                  <div key={c.uid} style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12.5 }}>{c.nombre || 'Cuenta'} {c.iban && <span style={{ color: 'var(--text3)' }}>· {c.iban.replace(/(.{4})/g, '$1 ').trim()}</span>}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)' }} className="mono">
                        {saldos.map(sd => `${NOMBRES_SALDO[sd.balance_type] || sd.balance_type} ${eur(Number(sd.balance_amount.amount), sd.balance_amount.currency)}`).join(' · ') || 'Sin saldos todavía'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text3)' }}>
                      Actualiza en el hub
                      <select value={c.cuenta_id ?? ''} onChange={e => vincular(c, { cuenta_id: e.target.value ? Number(e.target.value) : null })} style={campo}>
                        <option value="">No actualizar</option>
                        {cuentas.map(x => <option key={x.id} value={x.id}>{x.padre_id ? `${cuentas.find(p => p.id === x.padre_id)?.nombre} · ${x.nombre}` : x.tipo === 'operativa' && cuentas.some(h => h.padre_id === x.id) ? `${x.nombre} · disponible` : x.nombre}</option>)}
                      </select>
                      {saldos.length > 1 && (
                        <>
                          con el saldo
                          <select value={c.tipo_saldo ?? ''} onChange={e => vincular(c, { tipo_saldo: e.target.value || null })} style={campo}>
                            <option value="">Automático (disponible)</option>
                            {saldos.map(sd => <option key={sd.balance_type} value={sd.balance_type}>{NOMBRES_SALDO[sd.balance_type] || sd.balance_type}</option>)}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <MovimientosCard cuentasBanco={cuentasBanco} version={version} onCambio={reload} />
    </div>
  )
}
