import { NextResponse } from 'next/server'
import { cambiarEstado } from '@/lib/cartela-cambios'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Bandeja de cambios de Cartela (privada, con la cookie del hub): estado y nota de una petición.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = await req.json().catch(() => null)
  if (!Number.isInteger(id) || !body) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  const r = await cambiarEstado(id, String(body.estado ?? ''), typeof body.nota === 'string' ? body.nota : null)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
