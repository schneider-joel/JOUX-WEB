import { cookies } from 'next/headers'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import InvoiceEditor from './invoice-editor'
import { nombreArchivoFactura, nombreArchivoRef } from './nombre-archivo'

// El título de la página es el nombre que propone el navegador al guardar el PDF.
// Desde la pestaña del cliente (?ref=1) lleva su nº de referencia del proyecto.
type Props = { params: { id: string }; searchParams: { ref?: string } }

async function tituloPorRef(factura: { cliente: string; proyecto_id: number | null }, searchParams: Props['searchParams']) {
  if (searchParams.ref !== '1' || !factura.proyecto_id) return null
  const [{ data: p }, { data: emisor }] = await Promise.all([
    supabase.from('proyectos').select('numero_proyecto').eq('id', factura.proyecto_id).maybeSingle(),
    supabase.from('configuracion').select('valor').eq('clave', 'emisor_nombre').maybeSingle(),
  ])
  return p?.numero_proyecto ? nombreArchivoRef(emisor?.valor || 'Joel Schneider', factura.cliente, p.numero_proyecto) : null
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { data: f } = await supabase.from('facturas').select('numero, cliente, proyecto_id').eq('id', params.id).maybeSingle()
  const title = f ? (await tituloPorRef(f, searchParams)) || nombreArchivoFactura(f.numero, f.cliente) : 'Factura'
  return { title, robots: { index: false, follow: false } }
}

export default async function InvoicePage({ params, searchParams }: Props) {
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
  let modoRate: string | undefined
  if (factura.proyecto_id) {
    const [{ data: proyecto }, { data: diasData }] = await Promise.all([
      supabase.from('proyectos').select('modo_rate').eq('id', factura.proyecto_id).single(),
      supabase.from('dias_trabajados').select('*').eq('proyecto_id', factura.proyecto_id).order('fecha'),
    ])
    modoRate = proyecto?.modo_rate
    dias = diasData || []
  }

  const titulo = await tituloPorRef(factura, searchParams)

  const cfgVal = (clave: string, fallback = '') => cfg?.find((c: any) => c.clave === clave)?.valor || fallback

  const emisor = {
    nombre: cfgVal('emisor_nombre', 'Joel Schneider'),
    nif: cfgVal('emisor_nif'),
    // Facturas fechadas antes de la mudanza muestran la dirección de entonces.
    direccion: cfgVal('emisor_direccion_anterior') && factura.fecha < cfgVal('emisor_direccion_desde', '0000')
      ? cfgVal('emisor_direccion_anterior')
      : cfgVal('emisor_direccion'),
    email: cfgVal('emisor_email'),
    telefono: cfgVal('emisor_telefono'),
    iban: cfgVal('emisor_iban'),
    swift: cfgVal('emisor_swift'),
  }

  const ultimoNumero = maxNumeroActual > 0 ? `${prefijoActual}${maxNumeroActual}` : cfgVal('ultimo_numero_factura', 'F260000')

  return <InvoiceEditor factura={factura} emisor={emisor} clienteFiscalInicial={clienteFiscal} editable={editable} ultimoNumero={ultimoNumero} dias={dias} modoRate={modoRate} titulo={titulo} />
}
