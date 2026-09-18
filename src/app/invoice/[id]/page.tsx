import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import InvoiceEditor from './invoice-editor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const authCookie = cookies().get('joux_auth')?.value
  const editable = !!authCookie && !!process.env.APP_PASSWORD && authCookie === process.env.APP_PASSWORD

  const { data: factura } = await supabase.from('facturas').select('*').eq('id', params.id).single()

  if (!factura) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888' }}>
        Factura no encontrada
      </div>
    )
  }

  const { data: cfg } = await supabase.from('configuracion').select('*')
  const { data: clienteFiscal } = await supabase.from('clientes_fiscales').select('*').eq('cliente', factura.cliente).maybeSingle()

  const cfgVal = (clave: string, fallback = '') => cfg?.find((c: any) => c.clave === clave)?.valor || fallback

  const emisor = {
    nombre: cfgVal('emisor_nombre', 'Joel Schneider'),
    nif: cfgVal('emisor_nif'),
    direccion: cfgVal('emisor_direccion'),
    email: cfgVal('emisor_email'),
    telefono: cfgVal('emisor_telefono'),
    iban: cfgVal('emisor_iban'),
  }

  const ultimoNumero = cfgVal('ultimo_numero_factura', 'F260000')

  return <InvoiceEditor factura={factura} emisor={emisor} clienteFiscalInicial={clienteFiscal} editable={editable} ultimoNumero={ultimoNumero} />
}
