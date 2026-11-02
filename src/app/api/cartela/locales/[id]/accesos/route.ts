import { NextResponse } from 'next/server'
import { cerrarAccesos } from '@/lib/cartela-acceso'

export const dynamic = 'force-dynamic'

// Bandeja de cambios de Cartela (privada, con la cookie del hub): cierra los móviles con acceso y renueva el enlace de entrega.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  const r = await cerrarAccesos(id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
