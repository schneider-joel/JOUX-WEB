import { NextResponse } from 'next/server'
import { guardarDatosFiscales } from '@/lib/datos-fiscales'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Formulario público de datos fiscales (/datos/<token>). Público en el middleware: el token del
// proyecto es la llave. Los errores son claves cortas; el formulario las traduce al idioma del cliente.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'datos' }, { status: 400 })
  const r = await guardarDatosFiscales(params.token, {
    razon: String(body.razon ?? ''), nif: String(body.nif ?? ''), direccion: String(body.direccion ?? ''), pais: String(body.pais ?? ''),
  })
  if ('error' in r) return NextResponse.json({ error: r.status === 500 ? 'servidor' : r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
