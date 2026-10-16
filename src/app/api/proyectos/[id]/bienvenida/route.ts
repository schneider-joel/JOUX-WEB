import { NextResponse } from 'next/server'
import { enviarBienvenida, vistaBienvenida } from '@/lib/bienvenida'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Vista previa de la bienvenida al aceptar: email, factura del pago 1 (número, base, IVA, retención, total) y bloqueos.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const v = await vistaBienvenida(Number(params.id))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.status })
  return NextResponse.json(v)
}

// «Emitir y enviar»: crea la factura (si toca), la adjunta en PDF y envía la bienvenida por Gmail.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await enviarBienvenida(Number(params.id), new URL(req.url).origin)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
}
