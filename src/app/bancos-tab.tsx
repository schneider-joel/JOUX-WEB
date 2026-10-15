'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, batchQuery, type Cuenta } from '@/lib/supabase'
import MovimientosCard from './movimientos-card'

type Sesion = { session_id: string; aspsp: string; valid_until: string | null; ultimo_sync: string | null; ultimo_error: string | null }
type Saldo = { balance_type: string; name?: string; balance_amount: { amount: string; currency: string } }
type CuentaBanco = { uid: string; session_id: string; aspsp: string; nombre: string | null; iban: string | null; moneda: string | null; cuenta_id: number | null; tipo_saldo: string | null; saldos: Saldo[] | null; actualizado: string | null }
type Aspsp = { name: string; country: string; logo?: string; maximum_consent_validity?: number }

// Con el símbolo delante y punto de miles siempre, como el resto del hub (mismas cifras y decimales).
const SIMBOLO: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
const eur = (n: number, moneda = 'EUR') => (n < 0 ? '−' : '') + (SIMBOLO[moneda || 'EUR'] ?? `${moneda} `) +
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(Math.abs(n))
const hace = (d: string) => {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`
}
const NOMBRES_SALDO: Record<string, string> = { ITAV: 'disponible', CLAV: 'disponible', XPCD: 'previsto', CLBD: 'contable', ITBD: 'contable (intradía)', OPBD: 'apertura' }
const DESTACADOS = /bbva|revolut|wise/i

const Chevron = () => <svg className="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const IconoSync = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.6 6.3A4.8 4.8 0 0 0 3.7 5.2M3.4 9.7a4.8 4.8 0 0 0 8.9 1.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M3.4 2.7v2.8h2.8M12.6 13.3v-2.8H9.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>

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

  // Como la web: los bancos conectados, una fila por banco que se despliega en sus cuentas; debajo, los movimientos.
  return (
    <div className="col">
      <section className="block" aria-label="Bancos conectados">
        <p className="label caps"><span>Bancos conectados</span><i className="rule" /></p>
        {mensaje?.ok && <p className="nota ok">Banco conectado. Ya puedes elegir qué cuenta del hub actualiza cada una.</p>}
        {mensaje?.error && <p className="nota error">No se pudo conectar: {mensaje.error}</p>}
        <div className="acciones">
          {sesiones.length > 0 && <button type="button" className="pill pill--sm" onClick={sincronizar}><IconoSync />Sincronizar ahora</button>}
          <button type="button" className={sesiones.length > 0 ? 'ghost' : 'pill pill--sm'} onClick={abrirConectar}>Conectar banco</button>
        </div>
        <p className="nota" aria-live="polite">{estado || 'Open banking de solo lectura · se sincroniza solo cada mañana'}</p>

        {aspsps && (
          <div className="picker">
            <div className="field">
              <label className="caps" htmlFor="b-buscar">Buscar banco</label>
              <input id="b-buscar" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="BBVA, Revolut, Wise…" autoFocus />
            </div>
            <div className="picker__lista chips__row">
              {filtrados.map(a => (
                <button key={a.name} type="button" className="chip" onClick={() => conectar(a)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span>{a.logo && <img src={a.logo} alt="" width={16} height={16} className="picker__logo" />}{a.name}</span>
                </button>
              ))}
              {filtrados.length === 0 && <p className="nota">Ningún banco coincide.</p>}
            </div>
          </div>
        )}

        {!cargando && sesiones.length === 0 && !aspsps && (
          <p className="empty">Todavía no hay bancos conectados. Pulsa <b>Conectar banco</b>, elige el banco y autoriza el acceso desde su app. El permiso dura hasta 180 días; después hay que renovarlo.</p>
        )}

        {sesiones.length > 0 && (
          <ul className="projs focus">
            {sesiones.map(s => (
              <FilaBanco key={s.session_id} s={s} propias={cuentasBanco.filter(c => c.session_id === s.session_id)} cuentas={cuentas}
                onRenovar={abrirConectar} onDesconectar={() => desconectar(s)} onVincular={vincular} />
            ))}
          </ul>
        )}
      </section>

      <MovimientosCard cuentasBanco={cuentasBanco} version={version} onCambio={reload} />
    </div>
  )
}

// Un banco: su nombre, una línea con el permiso y la última lectura, y el punto de estado (rojo si la
// última lectura falló, ámbar si el permiso caduca pronto). Al desplegar: sus cuentas y a qué cuenta del hub van.
function FilaBanco({ s, propias, cuentas, onRenovar, onDesconectar, onVincular }: {
  s: Sesion; propias: CuentaBanco[]; cuentas: Cuenta[]
  onRenovar: () => void; onDesconectar: () => void; onVincular: (c: CuentaBanco, patch: Partial<CuentaBanco>) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const dias = s.valid_until ? Math.ceil((new Date(s.valid_until).getTime() - Date.now()) / 864e5) : null
  const caduca = dias !== null && dias < 14
  const [estado, punto] = s.ultimo_error ? [`Error: ${s.ultimo_error}`, 'dot--bad'] : caduca ? ['El permiso caduca pronto', 'dot--wait'] : ['Al día', 'dot--ok']
  return (
    <li className={`p${abierta ? ' is-open' : ''}`}>
      <button type="button" className="p__head p__head--banco" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span className="fa__t">{s.aspsp}</span>
        <span className="p__s caps">
          <span className={caduca ? 'aviso' : undefined}>{dias === null ? '' : dias <= 0 ? 'Permiso vencido · renuévalo' : `Permiso válido ${dias} días más`}</span>
          {s.ultimo_sync ? ` · sincronizado ${hace(s.ultimo_sync)}` : ''}
        </span>
        <span className="st" title={estado}><i className={`dot ${punto}`} aria-hidden="true" /><span className="sr">{estado}</span></span>
        <Chevron />
      </button>
      {abierta && (
        <div className="p__body">
          {s.ultimo_error && <p className="nota error">{s.ultimo_error}</p>}
          {propias.map(c => {
            const saldos = c.saldos || []
            return (
              <div key={c.uid} className="cb">
                <p className="cb__n">{c.nombre || 'Cuenta'} {c.iban && <span className="caps">· {c.iban.replace(/(.{4})/g, '$1 ').trim()}</span>}</p>
                <p className="cb__saldos mono">
                  {saldos.map(sd => `${NOMBRES_SALDO[sd.balance_type] || sd.balance_type} ${eur(Number(sd.balance_amount.amount), sd.balance_amount.currency)}`).join(' · ') || 'Sin saldos todavía'}
                </p>
                <div className="p__meta caps">
                  <label className="p__campo">Actualiza en el hub
                    <select value={c.cuenta_id ?? ''} onChange={e => onVincular(c, { cuenta_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">No actualizar</option>
                      {cuentas.map(x => <option key={x.id} value={x.id}>{x.padre_id ? `${cuentas.find(p => p.id === x.padre_id)?.nombre} · ${x.nombre}` : x.tipo === 'operativa' && cuentas.some(h => h.padre_id === x.id) ? `${x.nombre} · disponible` : x.nombre}</option>)}
                    </select>
                  </label>
                  {saldos.length > 1 && (
                    <label className="p__campo">con el saldo
                      <select value={c.tipo_saldo ?? ''} onChange={e => onVincular(c, { tipo_saldo: e.target.value || null })}>
                        <option value="">Automático (disponible)</option>
                        {saldos.map(sd => <option key={sd.balance_type} value={sd.balance_type}>{NOMBRES_SALDO[sd.balance_type] || sd.balance_type}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            )
          })}
          <div className="p__foot">
            {caduca ? <button type="button" className="ghost" onClick={onRenovar}>Renovar</button> : <span />}
            <span className="foot__r"><button type="button" className="copy caps borrar" onClick={onDesconectar}>Desconectar</button></span>
          </div>
        </div>
      )}
    </li>
  )
}
