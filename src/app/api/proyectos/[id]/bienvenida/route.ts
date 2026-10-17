import { NextResponse } from 'next/server'
import { CLAVES_INICIO, enviarBienvenida, vistaBienvenida, type ClaveInicio } from '@/lib/bienvenida'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// proyecto.bienvenida (por defecto) o factura.pago (la factura cuando el cliente manda sus datos fiscales).
const clave = (v: unknown): ClaveInicio => CLAVES_INICIO.includes(v as ClaveInicio) ? v as ClaveInicio : 'proyecto.bienvenida'

// Vista previa de la bienvenida al aceptar: email, factura del pago 1 (número, base, IVA, retención, total) y bloqueos.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const v = await vistaBienvenida(Number(params.id), clave(new URL(req.url).searchParams.get('clave')))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.status })
  return NextResponse.json(v)
}

// «Emitir y enviar»: crea la factura (si toca), la adjunta en PDF y envía la bienvenida por Gmail.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const r = await enviarBienvenida(Number(params.id), new URL(req.url).origin, clave(body?.clave))
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
}
