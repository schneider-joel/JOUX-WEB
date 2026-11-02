import { createHmac, hkdfSync, timingSafeEqual } from 'crypto'

// Enlace público de una factura (solo servidor): /invoice/<id>?k=<firma>. El id es correlativo, así que
// sin la firma cualquiera podría recorrerlas todas. La firma no caduca: va en los timesheets y en los emails.
function clave() {
  const secreto = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secreto) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return Buffer.from(hkdfSync('sha256', secreto, 'joux-hub', 'factura-enlace', 32))
}

const firma = (id: number | string) => createHmac('sha256', clave()).update(`factura:${id}`).digest('base64url').slice(0, 22)

export const enlaceFactura = (id: number, ref = false) => `/invoice/${id}?k=${firma(id)}${ref ? '&ref=1' : ''}`

export function firmaFacturaValida(id: string, k?: string) {
  if (!/^\d+$/.test(id) || !k) return false
  const esperada = Buffer.from(firma(Number(id)))
  const dada = Buffer.from(k)
  return dada.length === esperada.length && timingSafeEqual(dada, esperada)
}
