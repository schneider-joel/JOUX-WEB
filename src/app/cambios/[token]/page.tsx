import { cartaEntregada, localDeToken, peticionesDe, peticionPublica, qrDelLocal } from '@/lib/cartela-cambios'
import Cambios, { Simbolo } from './cambios'
import './cambios.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Tu carta · Cartela', robots: { index: false, follow: false } }

// Página del cliente de Cartela (su enlace de cambios): sin cuenta, el token (cartela_locales.token_cambios) es la llave.
// Arriba su carta y el QR para descargar; debajo, los cambios y su historial. Antes de la entrega, solo «en revisión».
// Aspecto de Cartela, no del hub. Para ver todos los estados sin base de datos: /cambios/demo (solo en local).
export default async function CambiosPage({ params }: { params: { token: string } }) {
  const local = await localDeToken(params.token)
  if (!local) return <EnlaceNoValido />
  const [entregada, peticiones, qr] = await Promise.all([cartaEntregada(local), peticionesDe(local.id), qrDelLocal(local)])
  return (
    <div className="cz">
      <Cambios token={params.token} nombre={local.nombre} urlCarta={local.url_carta} qr={entregada && qr ? { ver: `/api/cambios/${params.token}/qr?ver=1`, descargar: `/api/cambios/${params.token}/qr` } : null}
        entregada={entregada} pausado={local.estado === 'pausado'} inicial={peticiones.map(peticionPublica)} />
    </div>
  )
}

// Cualquier token que no sea de un local (se ve en local con /cambios/x, sin consultar la base).
function EnlaceNoValido() {
  return (
    <div className="cz">
      <main className="cz__app">
        <header className="cz__top">
          <p className="cz__marca"><Simbolo />cartela</p>
          <h1>Este enlace no funciona</h1>
          <p className="cz__sub">Puede que esté mal copiado o que ya no sea válido. Escríbenos a <a href="mailto:hola@cartela.live">hola@cartela.live</a> y te mandamos el tuyo.</p>
        </header>
      </main>
    </div>
  )
}
