import { localDeToken, qrDelLocal } from '@/lib/cartela-cambios'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// QR de la carta para descargar desde /cambios/<token> (pública en el middleware: el token es la llave).
// ?ver=1 lo enseña en la página; sin él, se descarga como archivo.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const local = await localDeToken(params.token)
  if (!local) return new Response('No existe', { status: 404 })
  const png = await qrDelLocal(local)
  if (!png) return new Response('Sin QR', { status: 404 })
  const ver = new URL(req.url).searchParams.has('ver')
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300',
      ...(ver ? {} : { 'Content-Disposition': `attachment; filename="QR ${local.nombre.replace(/["\\\r\n]/g, '')}.png"` }),
    },
  })
}
