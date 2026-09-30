import { PaginaTimesheet, metadataTimesheet } from '../cargar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type Props = { params: { token: string } }

export const generateMetadata = ({ params }: Props) => metadataTimesheet('t', params.token)

export default function Page({ params }: Props) {
  return <PaginaTimesheet ruta="t" token={params.token} />
}
