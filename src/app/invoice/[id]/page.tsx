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

  // El "próximo número" se calcula en vivo (MAX de las facturas que ya
  // existen con el prefijo del año actual, +1) en vez de confiar en un
  // contador guardado aparte — así, si se borra una factura de prueba, el
  // siguiente número generado no salta por delante como si siguiera existiendo.
  const anioActual = new Date().getFullYear()
  const prefijoActual = `F-${anioActual}-`
  const { data: facturasDelAnio } = await supabase.from('facturas').select('numero').like('numero', `${prefijoActual}%`)
  const maxNumeroActual = (facturasDelAnio || []).reduce((max, f) => {
    const m = f.numero?.match(new RegExp(`^${prefijoActual}(\\d+)$`))
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)

  let dias: any[] = []
  let proyectoTipo: string | undefined
  if (factura.proyecto_id) {
    const [{ data: proyecto }, { data: diasData }] = await Promise.all([
      supabase.from('proyectos').select('tipo').eq('id', factura.proyecto_id).single(),
      supabase.from('dias_trabajados').select('*').eq('proyecto_id', factura.proyecto_id).order('fecha'),
    ])
    proyectoTipo = proyecto?.tipo
    dias = diasData || []
  }

  const cfgVal = (clave: string, fallback = '') => cfg?.find((c: any) => c.clave === clave)?.valor || fallback

  const emisor = {
    nombre: cfgVal('emisor_nombre', 'Joel Schneider'),
    nif: cfgVal('emisor_nif'),
    direccion: cfgVal('emisor_direccion'),
    email: cfgVal('emisor_email'),
    telefono: cfgVal('emisor_telefono'),
    iban: cfgVal('emisor_iban'),
    swift: cfgVal('emisor_swift'),
  }

  const ultimoNumero = maxNumeroActual > 0 ? `${prefijoActual}${maxNumeroActual}` : cfgVal('ultimo_numero_factura', 'F260000')

  return <InvoiceEditor factura={factura} emisor={emisor} clienteFiscalInicial={clienteFiscal} editable={editable} ultimoNumero={ultimoNumero} dias={dias} proyectoTipo={proyectoTipo} />
}
