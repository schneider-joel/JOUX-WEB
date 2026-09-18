'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Factura, ClienteFiscal, DiaTrabajado } from '@/lib/supabase'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fmt2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const textos = {
  es: {
    titulo: 'FACTURA', numero: 'Número', referencia: 'Referencia', fecha: 'Fecha', vencimiento: 'Vencimiento', para: 'Para', de: 'De',
    concepto: 'CONCEPTO', precio: 'PRECIO', unidades: 'UNIDADES', subtotal: 'SUBTOTAL', iva: 'IVA', retencion: 'RETENCIÓN', total: 'TOTAL',
    baseImponible: 'BASE IMPONIBLE', totalLabel: 'Total', imprimir: 'Imprimir / Guardar PDF', editar: 'Editar', vista: 'Vista previa',
    guardar: 'Guardar cambios', guardando: 'Guardando...',
    notaFueraUe: 'Operación no sujeta a IVA por el art. 69.Uno.1º LIVA',
    notaTransferencia: 'Pagar por transferencia bancaria al siguiente número de cuenta',
    horas: 'Horas trabajadas', standby: 'Standby',
  },
  en: {
    titulo: 'INVOICE', numero: 'Number', referencia: 'Reference', fecha: 'Date', vencimiento: 'Due date', para: 'To', de: 'From',
    concepto: 'DESCRIPTION', precio: 'PRICE', unidades: 'QTY', subtotal: 'SUBTOTAL', iva: 'VAT', retencion: 'WITHHOLDING', total: 'TOTAL',
    baseImponible: 'NET AMOUNT', totalLabel: 'Total', imprimir: 'Print / Save PDF', editar: 'Edit', vista: 'Preview',
    guardar: 'Save changes', guardando: 'Saving...',
    notaFueraUe: 'Not subject to VAT under art. 69.One.1 of the Spanish VAT Law',
    notaTransferencia: 'Pay by bank transfer to the following account number',
    horas: 'Hours worked', standby: 'Standby',
  },
}

const IVA_PCT = 21
const RETENCION_PCT = 15

const inputStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '7px 10px', color: '#111', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }

function siguienteNumero(ultimo: string): string {
  const m = ultimo.match(/^(.*?)(\d+)$/)
  if (!m) return ''
  const [, prefijo, digitos] = m
  const siguiente = String(Number(digitos) + 1).padStart(digitos.length, '0')
  return `${prefijo}${siguiente}`
}

export default function InvoiceEditor({
  factura: initialFactura,
  emisor,
  clienteFiscalInicial,
  editable,
  ultimoNumero,
  dias = [],
  proyectoTipo,
}: {
  factura: Factura
  emisor: { nombre: string; nif: string; direccion: string; email: string; telefono: string; iban: string }
  clienteFiscalInicial: ClienteFiscal | null
  editable: boolean
  ultimoNumero: string
  dias?: DiaTrabajado[]
  proyectoTipo?: string
}) {
  const [factura, setFactura] = useState(initialFactura)
  const [clienteFiscal, setClienteFiscal] = useState<ClienteFiscal>(
    clienteFiscalInicial || { cliente: initialFactura.cliente, identificador: '', direccion: '' }
  )
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const idioma = factura.idioma === 'en' ? 'en' : 'es'
  const t = textos[idioma]
  const dentroUe = factura.tipo_factura === 'dentro_ue'

  const set = (patch: Partial<Factura>) => setFactura({ ...factura, ...patch })

  const base = Number(factura.importe) || 0
  const ivaAmount = dentroUe ? base * (IVA_PCT / 100) : 0
  const retencionAmount = dentroUe ? base * (RETENCION_PCT / 100) : 0
  const total = base + ivaAmount - retencionAmount

  const usarSiguienteNumero = () => {
    const next = siguienteNumero(ultimoNumero)
    if (next) set({ numero: next })
  }

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('facturas').update({
      numero: factura.numero,
      numero_referencia: factura.numero_referencia,
      fecha: factura.fecha,
      fecha_vencimiento: factura.fecha_vencimiento || null,
      cliente: factura.cliente,
      descripcion: factura.descripcion,
      concepto_detalle: factura.concepto_detalle,
      importe: factura.importe,
      idioma: factura.idioma || 'es',
      tipo_factura: factura.tipo_factura || 'fuera_ue',
    }).eq('id', factura.id)

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    if (clienteFiscal.identificador || clienteFiscal.direccion) {
      await supabase.from('clientes_fiscales').upsert({
        cliente: factura.cliente,
        identificador: clienteFiscal.identificador,
        direccion: clienteFiscal.direccion,
      })
    }

    if (factura.numero && /^[A-Za-z-]*\d+$/.test(factura.numero)) {
      await supabase.from('configuracion').update({ valor: factura.numero }).eq('clave', 'ultimo_numero_factura')
    }

    setSaving(false)
    setEditMode(false)
  }

  const fechaFmt = factura.fecha
    ? new Date(factura.fecha + 'T00:00:00').toLocaleDateString(idioma === 'es' ? 'es-ES' : 'en-GB')
    : ''
  const vencimientoFmt = factura.fecha_vencimiento
    ? new Date(factura.fecha_vencimiento + 'T00:00:00').toLocaleDateString(idioma === 'es' ? 'es-ES' : 'en-GB')
    : ''

  const mostrarDetalleHoras = proyectoTipo === 'ambushed_boldmove' && dias.length > 0
  const totalHoras = dias.reduce((s, d) => s + (d.hrs ?? 0), 0)
  const totalStandby = dias.reduce((s, d) => s + (d.standby_hrs ?? 0), 0)

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 10mm; }
          .no-print { display: none !important; }
          html, body { background: #fff !important; height: auto !important; }
          .invoice-table-wrap, .invoice-detail-wrap { overflow: visible !important; }
          .invoice-card { box-shadow: none !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
        }
        body { background: #f5f5f5; }
        .invoice-card { padding: 56px 64px; }
        .invoice-table-wrap, .invoice-detail-wrap { overflow-x: auto; }
        .invoice-table { table-layout: fixed; }
        .invoice-table th, .invoice-table td { white-space: normal; overflow-wrap: break-word; }
        .invoice-table .col-concepto { white-space: normal; }
        @media (max-width: 640px) {
          .invoice-card { padding: 28px 20px; }
          .invoice-top { flex-direction: column; align-items: flex-start !important; gap: 16px; }
          .invoice-top-right { text-align: left !important; }
          .invoice-parties { flex-direction: column; align-items: flex-start !important; gap: 16px; }
          .invoice-parties-right { text-align: left !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 680, margin: '24px auto 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {editable && (
            <>
              <button onClick={() => setEditMode(false)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer', background: !editMode ? '#111' : '#e5e5e5', color: !editMode ? '#fff' : '#333' }}>{t.vista}</button>
              <button onClick={() => setEditMode(true)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer', background: editMode ? '#111' : '#e5e5e5', color: editMode ? '#fff' : '#333' }}>{t.editar}</button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={idioma} onChange={e => set({ idioma: e.target.value as 'es' | 'en' })}
            style={{ padding: '8px 10px', borderRadius: 7, fontSize: 13, border: '1px solid #ddd', background: '#fff' }}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 7, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {t.imprimir}
          </button>
        </div>
      </div>

      {editable && editMode && (
        <div className="no-print" style={{ maxWidth: 680, margin: '16px auto', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 24, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Número (para Hacienda)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={factura.numero || ''} onChange={e => set({ numero: e.target.value })} placeholder="F260018" style={inputStyle} />
                <button type="button" onClick={usarSiguienteNumero} title={`Siguiente: ${siguienteNumero(ultimoNumero)}`}
                  style={{ flexShrink: 0, padding: '0 10px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', color: '#333', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                  Usar siguiente
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Referencia (para el cliente)</label>
              <input value={factura.numero_referencia || ''} onChange={e => set({ numero_referencia: e.target.value })} placeholder="268" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cliente</label>
              <input value={factura.cliente} onChange={e => set({ cliente: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={factura.fecha} onChange={e => set({ fecha: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Vencimiento</label>
              <input type="date" value={factura.fecha_vencimiento || ''} onChange={e => set({ fecha_vencimiento: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tipo de factura</label>
            <select value={factura.tipo_factura || 'fuera_ue'} onChange={e => set({ tipo_factura: e.target.value as 'fuera_ue' | 'dentro_ue' })} style={inputStyle}>
              <option value="fuera_ue">Fuera de la UE (sin IVA, con transferencia bancaria)</option>
              <option value="dentro_ue">Dentro de la UE / España (con IVA 21% y Retención -15%)</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Concepto (título)</label>
            <input value={factura.descripcion || ''} onChange={e => set({ descripcion: e.target.value })} placeholder="Tratamiento Digital Web" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Concepto (detalle)</label>
            <input value={factura.concepto_detalle || ''} onChange={e => set({ concepto_detalle: e.target.value })} placeholder="Presentación / Tratamiento Digital" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Importe (€)</label>
            <input type="number" value={factura.importe} onChange={e => set({ importe: Number(e.target.value) })} style={inputStyle} />
          </div>

          <div style={{ borderTop: '1px solid #eee', margin: '18px 0 14px', paddingTop: 14, fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Datos fiscales de {factura.cliente}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Identificador (CIF/VAT/nº registro)</label>
            <input value={clienteFiscal.identificador || ''} onChange={e => setClienteFiscal({ ...clienteFiscal, identificador: e.target.value })} placeholder="12810068 · VAT 12810068" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={labelStyle}>Dirección</label>
            <textarea value={clienteFiscal.direccion || ''} onChange={e => setClienteFiscal({ ...clienteFiscal, direccion: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          {saveError && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>{saveError}</div>
          )}
          <button onClick={save} disabled={saving} style={{ marginTop: 18, width: '100%', padding: '10px 16px', borderRadius: 7, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t.guardando : t.guardar}
          </button>
        </div>
      )}

      <div className="invoice-card" style={{
        maxWidth: 680, margin: '24px auto 48px', background: '#fff',
        fontFamily: 'Inter, sans-serif', color: '#111', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 8,
      }}>
        <div style={{ textAlign: 'right', fontSize: 12.5, lineHeight: 1.6, marginBottom: 28 }}>
          <div style={{ fontWeight: 600 }}>{emisor.nombre}</div>
          <div>{emisor.nif}</div>
          {emisor.direccion.split('\n').map((l, i) => <div key={i}>{l}</div>)}
          <div>{emisor.email}</div>
          <div>{emisor.telefono}</div>
        </div>

        <div className="invoice-top" style={{ borderTop: '1px solid #ddd', paddingTop: 20, display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {t.titulo} {factura.numero ? `#${factura.numero}` : <span style={{ color: '#dc2626' }}>({idioma === 'es' ? 'sin número asignado' : 'no number assigned'})</span>}
            </div>
            {factura.numero_referencia && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{t.referencia}: {factura.numero_referencia}</div>}
          </div>
          <div className="invoice-top-right" style={{ textAlign: 'right', fontSize: 12 }}>
            <div>{t.fecha}: {fechaFmt}</div>
            {vencimientoFmt && <div>{t.vencimiento}: {vencimientoFmt}</div>}
          </div>
        </div>

        <div className="invoice-parties" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{factura.cliente}</div>
            {clienteFiscal.identificador && <div>{clienteFiscal.identificador}</div>}
            {clienteFiscal.direccion && clienteFiscal.direccion.split('\n').map((l, i) => <div key={i}>{l}</div>)}
          </div>
          <div className="invoice-parties-right" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{t.totalLabel} {fmt2(total)}€</div>
          </div>
        </div>

        {!dentroUe && (
          <div style={{ fontSize: 12, color: '#444', background: '#f7f7f7', borderRadius: 6, padding: '10px 14px', marginBottom: 20 }}>
            {t.notaFueraUe}
          </div>
        )}

        <div className="invoice-table-wrap">
        <table className="invoice-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>
              <th style={{ width: dentroUe ? '28%' : '40%', textAlign: 'left', padding: '10px 8px 10px 0', fontSize: 11 }}>{t.concepto}</th>
              <th style={{ width: dentroUe ? '12%' : '15%', textAlign: 'right', padding: '10px 8px', fontSize: 11 }}>{t.precio}</th>
              <th style={{ width: dentroUe ? '10%' : '15%', textAlign: 'right', padding: '10px 8px', fontSize: 11 }}>{t.unidades}</th>
              <th style={{ width: dentroUe ? '13%' : '15%', textAlign: 'right', padding: '10px 8px', fontSize: 11 }}>{t.subtotal}</th>
              {dentroUe && <th style={{ width: '11%', textAlign: 'right', padding: '10px 8px', fontSize: 11 }}>{t.iva}</th>}
              {dentroUe && <th style={{ width: '13%', textAlign: 'right', padding: '10px 8px', fontSize: 11 }}>{t.retencion}</th>}
              <th style={{ width: dentroUe ? '13%' : '15%', textAlign: 'right', padding: '10px 0', fontSize: 11 }}>{t.total}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '14px 8px 14px 0', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>
                  {factura.descripcion || factura.cliente}
                  {factura.numero_referencia && <span style={{ fontWeight: 400, color: '#888' }}> · #{factura.numero_referencia}</span>}
                </div>
                {factura.concepto_detalle && <div style={{ color: '#888', fontSize: 12 }}>{factura.concepto_detalle}</div>}
              </td>
              <td style={{ padding: '14px 8px', fontSize: 13, textAlign: 'right' }}>{fmt2(base)}€</td>
              <td style={{ padding: '14px 8px', fontSize: 13, textAlign: 'right' }}>1</td>
              <td style={{ padding: '14px 8px', fontSize: 13, textAlign: 'right' }}>{fmt2(base)}€</td>
              {dentroUe && <td style={{ padding: '14px 8px', fontSize: 13, textAlign: 'right' }}>{IVA_PCT}%</td>}
              {dentroUe && <td style={{ padding: '14px 8px', fontSize: 13, textAlign: 'right' }}>-{RETENCION_PCT}%</td>}
              <td style={{ padding: '14px 0', fontSize: 13, textAlign: 'right' }}>{fmt2(total)}€</td>
            </tr>
          </tbody>
        </table>
        </div>

        {mostrarDetalleHoras && (
          <div className="invoice-detail-wrap" style={{ marginTop: 4, marginBottom: 8, display: 'flex', gap: 20, fontSize: 12, color: '#444' }}>
            <span><strong>{t.horas}:</strong> {totalHoras}h</span>
            <span><strong>{t.standby}:</strong> {totalStandby}h</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{t.baseImponible}</span>
            <span>{fmt2(base)}€</span>
          </div>
          {dentroUe && (
            <>
              <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{t.iva} {IVA_PCT}%</span>
                <span>{fmt2(ivaAmount)}€</span>
              </div>
              <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{t.retencion} {RETENCION_PCT}%</span>
                <span>-{fmt2(retencionAmount)}€</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 24, fontSize: 13, fontWeight: 700 }}>
            <span>{t.total}</span>
            <span>{fmt2(total)}€</span>
          </div>
        </div>

        {!dentroUe && emisor.iban && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 32, textAlign: 'center' }}>
            {t.notaTransferencia} <strong style={{ color: '#111' }}>{emisor.iban}</strong>
          </div>
        )}
      </div>
    </>
  )
}
