import { proyectoDeToken } from '@/lib/datos-fiscales'
import { UE_ISO } from '@/lib/ganado'
import FormDatos from './form'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = { title: 'Billing details', robots: { index: false, follow: false } }

// Página pública para que el cliente de una web rellene sus datos de facturación. Solo enseña la
// marca y el proyecto; el token del enlace (proyectos.token_fiscal) es la única llave.
export default async function DatosPage({ params }: { params: { token: string } }) {
  const d = await proyectoDeToken(params.token)
  if (!d) return (
    <div className="app">
      <main className="publica publica--vacia"><p className="empty">Link not found · Enlace no válido</p></main>
    </div>
  )
  const idioma = d.p.idioma === 'en' ? 'en' : 'es'
  // España primero, luego la UE por orden alfabético (en el idioma del cliente) y «otro país».
  const nombres = new Intl.DisplayNames([idioma], { type: 'region' })
  const ue = Array.from(UE_ISO).map(iso => ({ iso, nombre: nombres.of(iso) || iso })).sort((a, b) => a.nombre.localeCompare(b.nombre, idioma))
  const paises = [{ iso: 'ES', nombre: nombres.of('ES') || 'España' }, ...ue]
  return (
    <div className="app">
      <main className="publica">
        <FormDatos token={params.token} idioma={idioma} marca={d.marca} proyecto={d.p.nombre} paises={paises}
          inicial={d.datos ? { razon: d.datos.cliente, nif: d.datos.identificador || '', direccion: d.datos.direccion || '' } : null}
          facturado={d.facturado} />
      </main>
    </div>
  )
}
