import { localDeToken, peticionesDe, peticionPublica } from '@/lib/cartela-cambios'
import Cambios from './cambios'
import './cambios.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Cambios de tu carta · Cartela', robots: { index: false, follow: false } }

// Enlace de cambios de un local de Cartela: sin cuenta, el token (cartela_locales.token_cambios) es la llave.
// Aspecto de Cartela, no del hub (prototipo en 01 Agencias web/cartela/web/cambios-demo/).
export default async function CambiosPage({ params }: { params: { token: string } }) {
  const local = await localDeToken(params.token)
  if (!local) return (
    <div className="cz"><main className="cz__app cz__vacia"><p>Este enlace no es válido. Escríbenos a hola@cartela.live y te mandamos el tuyo.</p></main></div>
  )
  const peticiones = (await peticionesDe(local.id)).map(peticionPublica)
  return (
    <div className="cz">
      <Cambios token={params.token} nombre={local.nombre} urlCarta={local.url_carta} pausado={local.estado === 'pausado'} inicial={peticiones} />
    </div>
  )
}
