import { createClient } from '@supabase/supabase-js'
import PrintButton from './print-button'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fmt2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const textos = {
  es: {
    titulo: 'FACTURA', numero: 'Número', fecha: 'Fecha', para: 'Para', de: 'De',
    concepto: 'Concepto', importe: 'Importe', total: 'Total', estado: 'Estado',
    pendiente: 'Pendiente de cobro', cobrada: 'Cobrada', imprimir: 'Imprimir / Guardar PDF',
    notFound: 'Factura no encontrada',
  },
  en: {
    titulo: 'INVOICE', numero: 'Number', fecha: 'Date', para: 'To', de: 'From',
    concepto: 'Description', importe: 'Amount', total: 'Total', estado: 'Status',
    pendiente: 'Pending', cobrada: 'Paid', imprimir: 'Print / Save PDF',
    notFound: 'Invoice not found',
  },
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const { data: factura } = await supabase.from('facturas').select('*').eq('id', params.id).single()
  const { data: cfg } = await supabase.from('configuracion').select('*')

  const idioma = (factura?.idioma === 'en' ? 'en' : 'es') as 'es' | 'en'
  const t = textos[idioma]
  const emisorNombre = cfg?.find((c: any) => c.clave === 'emisor_nombre')?.valor || 'Joel Schneider'
  const emisorEmail = cfg?.find((c: any) => c.clave === 'emisor_email')?.valor || ''

  if (!factura) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888' }}>
        {t.notFound}
      </div>
    )
  }

  const fechaFmt = new Date(factura.fecha + 'T00:00:00').toLocaleDateString(idioma === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: #fff !important; } }
        body { background: #f5f5f5; }
      `}</style>
      <PrintButton label={t.imprimir} />
      <div style={{
        maxWidth: 680, margin: '48px auto', background: '#fff', padding: '56px 64px',
        fontFamily: 'Inter, sans-serif', color: '#111', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>{t.titulo}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
              {t.numero}: {factura.numero || `INV-${String(factura.id).padStart(4, '0')}`}
            </div>
          </div>
          <div style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, height: 'fit-content',
            background: factura.estado === 'cobrada' ? '#dcfce7' : '#fef3c7',
            color: factura.estado === 'cobrada' ? '#166534' : '#92400e',
          }}>
            {factura.estado === 'cobrada' ? t.cobrada : t.pendiente}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t.de}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{emisorNombre}</div>
            {emisorEmail && <div style={{ fontSize: 13, color: '#666' }}>{emisorEmail}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t.para}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{factura.cliente}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#666', marginBottom: 32 }}>{t.fecha}: {fechaFmt}</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111' }}>
              <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.concepto}</th>
              <th style={{ textAlign: 'right', padding: '10px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.importe}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '14px 0', fontSize: 14 }}>{factura.descripcion || factura.cliente}</td>
              <td style={{ padding: '14px 0', fontSize: 14, textAlign: 'right' }}>€{fmt2(factura.importe)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 200, fontSize: 16, fontWeight: 700, paddingTop: 12, borderTop: '2px solid #111' }}>
            <span>{t.total}</span>
            <span>€{fmt2(factura.importe)}</span>
          </div>
        </div>
      </div>
    </>
  )
}
