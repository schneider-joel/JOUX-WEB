import { cartaEntregada, localDeToken, peticionesDe, peticionPublica, qrDelLocal } from '@/lib/cartela-cambios'
import Cambios from './cambios'
import './cambios.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Tu carta · Cartela', robots: { index: false, follow: false } }

// Página del cliente de Cartela (su enlace de cambios): sin cuenta, el token (cartela_locales.token_cambios) es la llave.
// Arriba su carta y el QR para descargar; debajo, los cambios y su historial. Antes de la entrega, solo «en revisión».
// Aspecto de Cartela, no del hub (prototipo en 01 Agencias web/cartela/web/cambios-demo/).
export default async function CambiosPage({ params }: { params: { token: string } }) {
  const local = await localDeToken(params.token)
  if (!local) return (
    <div className="cz"><main className="cz__app cz__vacia"><p>Este enlace no es válido. Escríbenos a hola@cartela.live y te mandamos el tuyo.</p></main></div>
  )
  const [entregada, peticiones, qr] = await Promise.all([cartaEntregada(local), peticionesDe(local.id), qrDelLocal(local)])
  return (
    <div className="cz">
      <Cambios token={params.token} nombre={local.nombre} urlCarta={local.url_carta} conQr={!!qr} entregada={entregada} pausado={local.estado === 'pausado'} inicial={peticiones.map(peticionPublica)} />
    </div>
  )
}
