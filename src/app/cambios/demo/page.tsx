import { notFound } from 'next/navigation'
import Cambios from '../[token]/cambios'
import '../[token]/cambios.css'

export const metadata = { title: 'Tu carta · Cartela (demo)', robots: { index: false, follow: false } }

// Solo en local: la página del cliente con datos inventados, sin tocar la base (enviar responde «enlace no válido»).
// ?estado=revision | pausado | vacio | sinqr
const hace = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()
const QR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges"><rect width="7" height="7" fill="#fff"/><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 5h1v2H6zM4 6h1v1H4z" fill="#231B17"/></svg>')}`
const SIN_PLATO = { plato_id: null, plato_nombre: null, op: null, valor: null, parar: false }
const PETICIONES = [
  { id: 4, texto: 'Hoy no hay pulpo', fotos: 0, estado: 'recibida' as const, nota: null, created_at: hace(0.3), actualizada_at: null },
  { id: 3, texto: 'Sube la caña a 2,80 y el tercio a 3,20', fotos: 0, estado: 'en_curso' as const, nota: null, created_at: hace(20), actualizada_at: hace(2) },
  { id: 2, texto: 'Cambiar todas las fotos de los bocatas', fotos: 6, estado: 'escalada' as const, nota: null, created_at: hace(70), actualizada_at: hace(60) },
  { id: 1, texto: 'Añade tarta de queso al horno, 5 €.\nLleva huevo, lácteos y gluten', fotos: 1, estado: 'publicada' as const, nota: 'Tarta de queso al horno · 5,00 € en Postres, con huevo, lácteos y gluten.', created_at: hace(200), actualizada_at: hace(185) },
]

export default function CambiosDemo({ searchParams }: { searchParams: { estado?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const e = searchParams.estado
  return (
    <div className="cz">
      <Cambios token="demo" nombre="Bar Cresta" urlCarta="https://barcresta.cartela.live/"
        qr={e === 'sinqr' || e === 'revision' ? null : { ver: QR, descargar: QR }}
        entregada={e !== 'revision'} pausado={e === 'pausado'} inicial={e === 'vacio' ? [] : PETICIONES.map(p => ({ ...SIN_PLATO, ...p }))} />
    </div>
  )
}
