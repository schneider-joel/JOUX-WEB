'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Cuenta, Crypto, Factura, PresupuestoItem, Proyecto, DiaTrabajado, TipoProyecto } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const barColor = (pct: number) => pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4ade80'

type Tab = 'dashboard' | 'facturas' | 'presupuesto' | 'timesheet_ab' | 'timesheet_propios'
type Modal = { type: string; data?: any } | null

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [modal, setModal] = useState<Modal>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [crypto, setCrypto] = useState<Crypto[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [fijos, setFijos] = useState<PresupuestoItem[]>([])
  const [variables, setVariables] = useState<PresupuestoItem[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [dias, setDias] = useState<DiaTrabajado[]>([])
  const [ethPrice, setEthPrice] = useState<number>(2100)
  const [mesActual, setMesActual] = useState('2026-09')
  const [presupuestoTotal, setPresupuestoTotal] = useState(1800)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const loadData = useCallback(async () => {
    const [c, cr, f, fi, v, cfg, pr, di] = await Promise.all([
      supabase.from('cuentas').select('*').order('orden'),
      supabase.from('crypto').select('*'),
      supabase.from('facturas').select('*').order('fecha'),
      supabase.from('presupuesto_fijos').select('*'),
      supabase.from('presupuesto_variables').select('*'),
      supabase.from('configuracion').select('*'),
      supabase.from('proyectos').select('*').order('created_at'),
      supabase.from('dias_trabajados').select('*').order('fecha'),
    ])
    if (c.data) setCuentas(c.data)
    if (cr.data) setCrypto(cr.data)
    if (f.data) setFacturas(f.data)
    if (fi.data) setFijos(fi.data)
    if (v.data) setVariables(v.data)
    if (pr.data) setProyectos(pr.data)
    if (di.data) setDias(di.data)
    if (cfg.data) {
      const mes = cfg.data.find((x: any) => x.clave === 'mes_actual')?.valor
      const pt = cfg.data.find((x: any) => x.clave === 'presupuesto_total')?.valor
      const eth = cfg.data.find((x: any) => x.clave === 'eth_price')?.valor
      if (mes) setMesActual(mes)
      if (pt) setPresupuestoTotal(Number(pt))
      if (eth) setEthPrice(Number(eth))
    }
    setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalLiquidez = cuentas.reduce((s, c) => s + c.saldo, 0)
  const totalCrypto = crypto.reduce((s, c) => c.symbol === 'ETH' ? s + c.cantidad * ethPrice : s, 0)
  const totalPatrimonio = totalLiquidez + totalCrypto
  const facturasPendientes = facturas.filter(f => f.estado === 'pendiente')
  const facturasCobradas = facturas.filter(f => f.estado === 'cobrada')
  const totalPendiente = facturasPendientes.reduce((s, f) => s + f.importe, 0)

  const marcarCobrada = async (factura: Factura) => {
    const { error } = await supabase
      .from('facturas')
      .update({ estado: 'cobrada', fecha_cobro: new Date().toISOString().split('T')[0], cuenta_destino_id: factura.cuenta_destino_id || cuentas.find(c => c.tipo === 'operativa')?.id })
      .eq('id', factura.id)
    if (!error) loadData()
  }

  const deleteFactura = async (id: number) => {
    await supabase.from('facturas').delete().eq('id', id)
    loadData()
  }

  const addFactura = async (data: any) => {
    await supabase.from('facturas').insert([{ ...data, estado: 'pendiente', origen: 'manual' }])
    setModal(null)
    loadData()
  }


  const updateCuentaSaldo = async (id: number, saldo: number) => {
    await supabase.from('cuentas').update({ saldo }).eq('id', id)
    loadData()
  }

  const addGasto = async (tabla: string, id: number, importe: number) => {
    const items = tabla === 'fijos' ? fijos : variables
    const item = items.find(i => i.id === id)
    if (!item) return
    await supabase.from(tabla === 'fijos' ? 'presupuesto_fijos' : 'presupuesto_variables')
      .update({ gastado: item.gastado + importe }).eq('id', id)
    setModal(null)
    loadData()
  }

  const editLimite = async (tabla: string, id: number, limite: number) => {
    await supabase.from(tabla === 'fijos' ? 'presupuesto_fijos' : 'presupuesto_variables')
      .update({ limite }).eq('id', id)
    setModal(null)
    loadData()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)', fontFamily: 'Inter, sans-serif' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.5px' }}>JOUX · Finanzas</h1>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Panel de control personal</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
          {lastUpdated && `Actualizado: ${lastUpdated}`}
        </div>
      </header>

      {/* Patrimonio */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 32px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Patrimonio total</div>
          <div style={{ fontSize: 42, fontWeight: 300, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -1, color: 'var(--green)' }}>€{fmt(totalPatrimonio)}</div>
        </div>
        <div style={{ display: 'flex', gap: 24, textAlign: 'right' }}>
          {[
            { label: 'Liquidez', val: `€${fmt(totalLiquidez)}`, color: 'var(--green)' },
            { label: 'Crypto', val: `€${fmt(totalCrypto)}`, color: 'var(--text2)' },
            { label: 'Por cobrar', val: `€${fmt(totalPendiente)}`, color: 'var(--amber)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface2)', padding: 4, borderRadius: 8, width: 'fit-content', flexWrap: 'wrap' }}>
        {/* 'presupuesto' oculta por ahora: requiere carga manual constante. Datos y código quedan intactos. */}
        {(['dashboard', 'facturas', 'timesheet_ab', 'timesheet_propios'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
            background: tab === t ? 'var(--surface)' : 'transparent',
            color: tab === t ? 'var(--text)' : 'var(--text2)',
          }}>
            {{ dashboard: 'Dashboard', facturas: 'Facturas', presupuesto: 'Presupuesto', timesheet_ab: 'Timesheet AB', timesheet_propios: 'Timesheet Propios' }[t]}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Cuentas + Crypto */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cuentas</span>
              <button onClick={() => setModal({ type: 'editCuentas' })} style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'Inter, sans-serif' }}>+ Editar</button>
            </div>
            {cuentas.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', fontSize: 13 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
                  {c.nombre}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500 }}>€{fmt(c.saldo)}</div>
              </div>
            ))}

            {/* Crypto section */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Crypto</div>
              {crypto.map(c => {
                const val = c.symbol === 'ETH' ? c.cantidad * ethPrice : 0
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: 13 }}>
                      <div style={{ color: 'var(--text2)' }}>{c.cantidad} {c.symbol}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>€{fmt2(ethPrice)}/{c.symbol}</div>
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500, color: 'var(--purple)' }}>€{fmt(val)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Facturas pendientes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Próximas facturas · <span style={{ color: 'var(--green)' }}>€{fmt(totalPendiente)}</span>
              </span>
              <button onClick={() => setTab('facturas')} style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'Inter, sans-serif' }}>Ver todas →</button>
            </div>
            {facturasPendientes.slice(0, 8).map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{f.cliente}{f.descripcion ? ` · ${f.descripcion}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Vence {fmtDate(f.fecha)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500, color: 'var(--green)' }}>+€{fmt(f.importe)}</div>
                  <button onClick={() => marcarCobrada(f)} style={{ color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 'bold' }}>✓</button>
                </div>
              </div>
            ))}
            <button onClick={() => setModal({ type: 'addFactura' })} style={{ marginTop: 12, width: '100%', padding: '8px 14px', border: '1px dashed var(--border)', borderRadius: 8, background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              + Nueva factura
            </button>
          </div>
        </div>
      )}

      {/* Facturas Tab */}
      {tab === 'facturas' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Facturas pendientes · €{fmt(totalPendiente)} por cobrar
            </span>
            <button onClick={() => setModal({ type: 'addFactura' })} style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontFamily: 'Inter, sans-serif' }}>
              + Nueva factura
            </button>
          </div>
          {facturasPendientes.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{f.cliente}{f.descripcion ? ` · ` : ''}<span style={{ color: 'var(--text3)' }}>{f.descripcion}</span></div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Vence {fmtDate(f.fecha)}{f.origen === 'notion' ? ' · Notion' : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500, color: 'var(--green)' }}>+€{fmt(f.importe)}</div>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)', fontWeight: 500 }}>pendiente</span>
                <a href={`/invoice/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', fontSize: 15, textDecoration: 'none' }} title="Ver invoice">🧾</a>
                <button onClick={() => marcarCobrada(f)} style={{ color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✓</button>
                <button onClick={() => deleteFactura(f.id)} style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            </div>
          ))}
          {facturasCobradas.length > 0 && (
            <>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Cobradas
              </div>
              {facturasCobradas.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)', opacity: 0.5 }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{f.cliente}{f.descripcion ? ` · ${f.descripcion}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{f.fecha_cobro ? fmtDate(f.fecha_cobro) : fmtDate(f.fecha)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500 }}>€{fmt(f.importe)}</div>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'var(--green-dim)', color: 'var(--green)', fontWeight: 500 }}>cobrada</span>
                    <a href={`/invoice/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', fontSize: 15, textDecoration: 'none' }} title="Ver invoice">🧾</a>
                    <button onClick={() => deleteFactura(f.id)} style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Presupuesto Tab */}
      {tab === 'presupuesto' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          {(() => {
            const totalFijosGastado = fijos.reduce((s, c) => s + c.gastado, 0)
            const totalFijosLimite = fijos.reduce((s, c) => s + c.limite, 0)
            const totalVarsGastado = variables.reduce((s, c) => s + c.gastado, 0)
            const totalVarsLimite = variables.reduce((s, c) => s + c.limite, 0)
            const totalGastado = totalFijosGastado + totalVarsGastado
            const totalPct = Math.min(Math.round(totalGastado / presupuestoTotal * 100), 100)

            const renderItem = (item: PresupuestoItem, tabla: string) => {
              const pct = item.limite > 0 ? Math.min(Math.round(item.gastado / item.limite * 100), 100) : 0
              return (
                <div key={item.id} style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{item.nombre}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)' }}>€{fmt(item.gastado)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>/ </span>
                      <span onClick={() => setModal({ type: 'editLimite', data: { item, tabla } })} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text3)', cursor: 'pointer', textDecoration: 'underline dotted' }}>€{fmt(item.limite)}</span>
                      <button onClick={() => setModal({ type: 'addGasto', data: { item, tabla } })} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ Añadir</button>
                    </div>
                  </div>
                  {item.limite > 0 && (
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              )
            }

            return (
              <>
                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 20 }}>
                  <div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Gastado</div><div style={{ fontSize: 16, fontWeight: 500, color: barColor(totalPct) }}>€{fmt(totalGastado)}</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text2)' }}>Disponible</div><div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text2)' }}>€{fmt(presupuestoTotal - totalGastado)}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: 'var(--text2)' }}>Presupuesto mes</div><div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text2)' }}>€{fmt(presupuestoTotal)}</div></div>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 24 }}>
                  <div style={{ height: '100%', width: `${totalPct}%`, background: barColor(totalPct) }} />
                </div>

                {/* Fijos */}
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Gastos fijos · €{fmt(totalFijosGastado)} / €{fmt(totalFijosLimite)}
                </div>
                {fijos.map(item => renderItem(item, 'fijos'))}

                <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

                {/* Variables */}
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Gastos variables · €{fmt(totalVarsGastado)} / €{fmt(totalVarsLimite)}
                </div>
                {variables.map(item => renderItem(item, 'variables'))}
              </>
            )
          })()}
        </div>
      )}

      {/* Timesheet Ambushed/BoldMove Tab */}
      {tab === 'timesheet_ab' && (
        <TimesheetTab tipo="ambushed_boldmove" proyectos={proyectos} dias={dias} reload={loadData} />
      )}

      {/* Timesheet Clientes Propios Tab */}
      {tab === 'timesheet_propios' && (
        <TimesheetTab tipo="propio" proyectos={proyectos} dias={dias} reload={loadData} />
      )}

      {/* Modals */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 420, maxWidth: '90vw' }}>

            {modal.type === 'addFactura' && (
              <ModalAddFactura cuentas={cuentas} onAdd={addFactura} onClose={() => setModal(null)} />
            )}
            {modal.type === 'addGasto' && (
              <ModalAddGasto item={modal.data.item} tabla={modal.data.tabla} onAdd={addGasto} onClose={() => setModal(null)} />
            )}
            {modal.type === 'editLimite' && (
              <ModalEditLimite item={modal.data.item} tabla={modal.data.tabla} onSave={editLimite} onClose={() => setModal(null)} />
            )}
            {modal.type === 'editCuentas' && (
              <ModalEditCuentas cuentas={cuentas} onUpdate={updateCuentaSaldo} onClose={() => { setModal(null); loadData() }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalAddFactura({ cuentas, onAdd, onClose }: { cuentas: Cuenta[], onAdd: (d: any) => void, onClose: () => void }) {
  const [form, setForm] = useState({ cliente: '', descripcion: '', importe: '', fecha: new Date().toISOString().split('T')[0], cuenta_destino_id: '', idioma: 'es' })
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nueva factura <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      {[
        { label: 'Cliente', key: 'cliente', type: 'text', placeholder: 'Ambushed, Hans Emanuel...' },
        { label: 'Descripción (opcional)', key: 'descripcion', type: 'text', placeholder: 'Proyecto, treatment...' },
        { label: 'Importe (€)', key: 'importe', type: 'number', placeholder: '0' },
        { label: 'Fecha de cobro', key: 'fecha', type: 'date', placeholder: '' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{f.label}</label>
          <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
            onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
        </div>
      ))}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Cuenta destino (cuando se cobre)</label>
        <select value={form.cuenta_destino_id} onChange={e => setForm({ ...form, cuenta_destino_id: e.target.value })}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }}>
          <option value="">Seleccionar cuenta...</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Idioma del invoice</label>
        <select value={form.idioma} onChange={e => setForm({ ...form, idioma: e.target.value })}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => form.cliente && form.importe && onAdd({ ...form, importe: Number(form.importe), cuenta_destino_id: form.cuenta_destino_id ? Number(form.cuenta_destino_id) : null })}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Añadir
        </button>
      </div>
    </>
  )
}

function ModalAddGasto({ item, tabla, onAdd, onClose }: { item: PresupuestoItem, tabla: string, onAdd: (tabla: string, id: number, importe: number) => void, onClose: () => void }) {
  const [importe, setImporte] = useState('')
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Añadir gasto · {item.nombre} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Importe (€)</label>
        <input type="number" placeholder="0" value={importe} onChange={e => setImporte(e.target.value)}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => importe && onAdd(tabla, item.id, Number(importe))}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Añadir
        </button>
      </div>
    </>
  )
}

function ModalEditLimite({ item, tabla, onSave, onClose }: { item: PresupuestoItem, tabla: string, onSave: (tabla: string, id: number, limite: number) => void, onClose: () => void }) {
  const [limite, setLimite] = useState(String(item.limite))
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Editar límite · {item.nombre} <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Nuevo límite (€)</label>
        <input type="number" value={limite} onChange={e => setLimite(e.target.value)}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        <button onClick={() => onSave(tabla, item.id, Number(limite))}
          style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Guardar
        </button>
      </div>
    </>
  )
}

function ModalEditCuentas({ cuentas, onUpdate, onClose }: { cuentas: Cuenta[], onUpdate: (id: number, saldo: number) => void, onClose: () => void }) {
  const [values, setValues] = useState<{ [id: number]: string }>(Object.fromEntries(cuentas.map(c => [c.id, String(c.saldo)])))
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Editar saldos <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      {cuentas.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{c.nombre}</span>
          <input type="number" value={values[c.id]} onChange={e => setValues({ ...values, [c.id]: e.target.value })}
            style={{ width: 110, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
        </div>
      ))}
      <button onClick={async () => { await Promise.all(cuentas.map(c => onUpdate(c.id, Number(values[c.id])))); onClose() }}
        style={{ marginTop: 16, width: '100%', padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
        Guardar todos
      </button>
    </>
  )
}

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }
const cancelBtnStyle = { padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }
const confirmBtnStyle = { flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }

const statusColor: Record<string, string> = { activo: 'var(--amber)', completado: 'var(--text2)', facturado: 'var(--green)' }

function TimesheetTab({ tipo, proyectos, dias, reload }: { tipo: TipoProyecto, proyectos: Proyecto[], dias: DiaTrabajado[], reload: () => void }) {
  const [modal, setModal] = useState<Modal>(null)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [publicUrl, setPublicUrl] = useState('')

  useEffect(() => {
    if (tipo !== 'ambushed_boldmove') return
    supabase.from('configuracion').select('valor').eq('clave', 'timesheet_public_token').single()
      .then(({ data }) => { if (data?.valor) setPublicUrl(`${window.location.origin}/timesheet/${data.valor}`) })
  }, [tipo])

  const proyectosFiltrados = proyectos.filter(p => p.tipo === tipo)
  const diasDe = (proyectoId: number) => dias.filter(d => d.proyecto_id === proyectoId).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const totalProyecto = (proyectoId: number) => diasDe(proyectoId).reduce((s, d) => s + Number(d.total_day), 0)

  const cambiarStatus = async (p: Proyecto, status: string) => {
    if (status === 'facturado') {
      const monto = totalProyecto(p.id)
      if (!confirm(`Marcar "${p.nombre}" como Facturado va a crear una factura pendiente por €${fmt(monto)}. ¿Confirmás?`)) return
    }
    await supabase.from('proyectos').update({ status }).eq('id', p.id)
    reload()
  }

  const addProyecto = async (data: { nombre: string; cliente: string }) => {
    await supabase.from('proyectos').insert([{ ...data, tipo, status: 'activo' }])
    setModal(null)
    reload()
  }

  const deleteProyecto = async (id: number) => {
    if (!confirm('¿Borrar este proyecto y todos sus días?')) return
    await supabase.from('proyectos').delete().eq('id', id)
    reload()
  }

  const addDia = async (proyectoId: number, data: any) => {
    await supabase.from('dias_trabajados').insert([{ proyecto_id: proyectoId, ...data }])
    setModal(null)
    reload()
  }

  const deleteDia = async (id: number) => {
    await supabase.from('dias_trabajados').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      {tipo === 'ambushed_boldmove' && publicUrl && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
          <span>Link público de solo lectura para Ambushed / BoldMove</span>
          <button onClick={() => { navigator.clipboard.writeText(publicUrl) }} style={{ fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Copiar link
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setModal({ type: 'addProyecto' })} style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontFamily: 'Inter, sans-serif' }}>
          + Nuevo proyecto
        </button>
      </div>

      {proyectosFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>No hay proyectos todavía.</div>
      )}

      {proyectosFiltrados.map(p => {
        const total = totalProyecto(p.id)
        const isOpen = expandido === p.id
        return (
          <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandido(isOpen ? null : p.id)}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.cliente}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500 }}>€{fmt(total)}</div>
                <select value={p.status} onClick={e => e.stopPropagation()} onChange={e => cambiarStatus(p, e.target.value)}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--surface2)', color: statusColor[p.status], border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>
                  <option value="activo">Activo</option>
                  <option value="completado">Completado</option>
                  <option value="facturado">Facturado</option>
                </select>
                <button onClick={e => { e.stopPropagation(); deleteProyecto(p.id) }} style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                {diasDe(p.id).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Sin días cargados.</div>
                )}
                {diasDe(p.id).map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12, borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ color: 'var(--text2)', width: 70 }}>{fmtDate(d.fecha)}</div>
                    {tipo === 'ambushed_boldmove' ? (
                      <div style={{ color: 'var(--text3)', flex: 1 }}>{d.hrs}h × €{d.rate}{d.standby_hrs > 0 ? ` · SB ${d.standby_hrs}h` : ''}</div>
                    ) : (
                      <div style={{ color: 'var(--text3)', flex: 1 }}>€{d.rate}/día</div>
                    )}
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', width: 70, textAlign: 'right' }}>€{fmt2(d.total_day)}</div>
                    <span style={{ fontSize: 10, color: 'var(--text3)', width: 80, textAlign: 'right' }}>{d.status}</span>
                    <button onClick={() => deleteDia(d.id)} style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginLeft: 8 }}>×</button>
                  </div>
                ))}
                <button onClick={() => setModal({ type: 'addDia', data: { proyectoId: p.id } })} style={{ marginTop: 10, width: '100%', padding: '6px 12px', border: '1px dashed var(--border)', borderRadius: 8, background: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  + Nuevo día
                </button>
              </div>
            )}
          </div>
        )
      })}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 380, maxWidth: '90vw' }}>
            {modal.type === 'addProyecto' && (
              <ModalAddProyecto tipo={tipo} onAdd={addProyecto} onClose={() => setModal(null)} />
            )}
            {modal.type === 'addDia' && (
              <ModalAddDia tipo={tipo} onAdd={(d: any) => addDia(modal.data.proyectoId, d)} onClose={() => setModal(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalAddProyecto({ tipo, onAdd, onClose }: { tipo: TipoProyecto, onAdd: (d: { nombre: string; cliente: string }) => void, onClose: () => void }) {
  const [nombre, setNombre] = useState('')
  const [cliente, setCliente] = useState(tipo === 'ambushed_boldmove' ? 'Ambushed' : '')
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nuevo proyecto <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Nombre del proyecto</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Verizon x FIFA World Cup" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Cliente</label>
        {tipo === 'ambushed_boldmove' ? (
          <select value={cliente} onChange={e => setCliente(e.target.value)} style={inputStyle}>
            <option value="Ambushed">Ambushed</option>
            <option value="BoldMove">BoldMove</option>
          </select>
        ) : (
          <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Ej: Hans Emanuel" style={inputStyle} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
        <button onClick={() => nombre && cliente && onAdd({ nombre, cliente })} style={confirmBtnStyle}>Crear</button>
      </div>
    </>
  )
}

function ModalAddDia({ tipo, onAdd, onClose }: { tipo: TipoProyecto, onAdd: (d: any) => void, onClose: () => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [rate, setRate] = useState('')
  const [hrs, setHrs] = useState('')
  const [standby, setStandby] = useState('')
  const [status, setStatus] = useState('hecho')

  const submit = () => {
    if (!rate) return
    onAdd({
      fecha,
      rate: Number(rate),
      hrs: tipo === 'ambushed_boldmove' ? Number(hrs || 0) : null,
      standby_hrs: tipo === 'ambushed_boldmove' ? Number(standby || 0) : 0,
      status,
    })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Nuevo día <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Fecha</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{tipo === 'ambushed_boldmove' ? 'Rate por hora (€)' : 'Rate por día (€)'}</label>
        <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" style={inputStyle} />
      </div>
      {tipo === 'ambushed_boldmove' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Horas trabajadas</label>
            <input type="number" value={hrs} onChange={e => setHrs(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Stand by hrs</label>
            <input type="number" value={standby} onChange={e => setStandby(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="hecho">Hecho</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
        <button onClick={submit} style={confirmBtnStyle}>Agregar</button>
      </div>
    </>
  )
}

