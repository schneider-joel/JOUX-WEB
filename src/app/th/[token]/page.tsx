import { PaginaTimesheet, metadataTimesheet } from '../../t/cargar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type Props = { params: { token: string } }

export const generateMetadata = ({ params }: Props) => metadataTimesheet('th', params.token)

export default function Page({ params }: Props) {
  return <PaginaTimesheet ruta="th" token={params.token} />
}
