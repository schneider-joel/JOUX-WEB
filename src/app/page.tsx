'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Cuenta, Crypto, Factura, PresupuestoItem, NotionProyectoPendiente } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const barColor = (pct: number) => pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4ade80'

type Tab = 'dashboard' | 'facturas' | 'presupuesto'
type Modal = { type: string; data?: any } | null

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [modal, setModal] = useState<Modal>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [crypto, setCrypto] = useState<Crypto[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [fijos, setFijos] = useState<PresupuestoItem[]>([])
  const [variables, setVariables] = useState<PresupuestoItem[]>([])
  const [ethPrice, setEthPrice] = useState<number>(2100)
  const [mesActual, setMesActual] = useState('2026-09')
  const [presupuestoTotal, setPresupuestoTotal] = useState(1800)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const loadData = useCallback(async () => {
    const [c, cr, f, fi, v, cfg] = await Promise.all([
      supabase.from('cuentas').select('*').order('orden'),
      supabase.from('crypto').select('*'),
      supabase.from('facturas').select('*').order('fecha'),
      supabase.from('presupuesto_fijos').select('*'),
      supabase.from('presupuesto_variables').select('*'),
      supabase.from('configuracion').select('*'),
    ])
    if (c.data) setCuentas(c.data)
    if (cr.data) setCrypto(cr.data)
    if (f.data) setFacturas(f.data)
    if (fi.data) setFijos(fi.data)
    if (v.data) setVariables(v.data)
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

  const importarDeNotion = async (items: (NotionProyectoPendiente & { fecha: string; idioma: 'es' | 'en' })[]) => {
    await supabase.from('facturas').insert(
      items.map(it => ({
        cliente: it.cliente,
        descripcion: it.proyecto,
        importe: it.total,
        fecha: it.fecha,
        estado: 'pendiente',
        origen: 'notion',
        notion_proyecto: it.notionId,
        idioma: it.idioma,
      }))
    )
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface2)', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        {(['dashboard', 'facturas', 'presupuesto'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif',
            background: tab === t ? 'var(--surface)' : 'transparent',
            color: tab === t ? 'var(--text)' : 'var(--text2)',
          }}>
            {t === 'dashboard' ? 'Dashboard' : t === 'facturas' ? 'Facturas' : 'Presupuesto'}
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModal({ type: 'syncNotion' })} style={{ fontSize: 11, color: 'var(--text2)', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontFamily: 'Inter, sans-serif' }}>
                ⟳ Sync Notion
              </button>
              <button onClick={() => setModal({ type: 'addFactura' })} style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontFamily: 'Inter, sans-serif' }}>
                + Nueva factura
              </button>
            </div>
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
            {modal.type === 'syncNotion' && (
              <ModalSyncNotion onImport={importarDeNotion} onClose={() => setModal(null)} />
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

type NotionItemForm = NotionProyectoPendiente & { fecha: string; idioma: 'es' | 'en'; checked: boolean }

function ModalSyncNotion({ onImport, onClose }: { onImport: (items: (NotionProyectoPendiente & { fecha: string; idioma: 'es' | 'en' })[]) => void, onClose: () => void }) {
  const [items, setItems] = useState<NotionItemForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    fetch('/api/notion-sync')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        const hoy = new Date().toISOString().split('T')[0]
        setItems((data.pendientes || []).map((p: NotionProyectoPendiente) => ({ ...p, fecha: hoy, idioma: 'es', checked: true })))
      })
      .catch(() => setError('No se pudo conectar con Notion'))
      .finally(() => setLoading(false))
  }, [])

  const update = (notionId: string, patch: Partial<NotionItemForm>) => {
    setItems(items.map(it => it.notionId === notionId ? { ...it, ...patch } : it))
  }

  const confirmar = async () => {
    const seleccionados = items.filter(it => it.checked)
    if (seleccionados.length === 0) return onClose()
    setImporting(true)
    await onImport(seleccionados.map(({ checked, ...rest }) => rest))
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 16, fontWeight: 500 }}>
        Sync desde Notion <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--text3)', padding: '20px 0', textAlign: 'center' }}>Buscando proyectos marcados como Facturado...</div>}
      {error && <div style={{ fontSize: 13, color: 'var(--amber)', padding: '12px 0' }}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '20px 0', textAlign: 'center' }}>No hay proyectos nuevos marcados como Facturado en Notion.</div>
      )}

      {items.map(it => (
        <div key={it.notionId} style={{ padding: '12px 0', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <input type="checkbox" checked={it.checked} onChange={e => update(it.notionId, { checked: e.target.checked })} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{it.proyecto}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{it.cliente}</div>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500, color: 'var(--green)' }}>€{fmt(it.total)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingLeft: 26 }}>
            <input type="date" value={it.fecha} onChange={e => update(it.notionId, { fecha: e.target.value })}
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 12, fontFamily: 'Inter, sans-serif', outline: 'none' }} />
            <select value={it.idioma} onChange={e => update(it.notionId, { idioma: e.target.value as 'es' | 'en' })}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 12, fontFamily: 'Inter, sans-serif', outline: 'none' }}>
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Inter, sans-serif' }}>Cancelar</button>
        {items.length > 0 && (
          <button onClick={confirmar} disabled={importing} style={{ flex: 1, padding: '9px 18px', borderRadius: 7, fontSize: 13, cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1, background: 'var(--blue)', color: '#000', border: 'none', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
            {importing ? 'Importando...' : `Importar ${items.filter(i => i.checked).length} factura(s)`}
          </button>
        )}
      </div>
    </>
  )
}
