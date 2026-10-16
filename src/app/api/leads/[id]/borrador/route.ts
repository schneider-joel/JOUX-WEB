import { NextResponse } from 'next/server'
import { generarBorrador } from '@/lib/ia'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// «Regenerar» / «Redactar con IA» en la ficha del lead: descarta el borrador de IA anterior y crea otro.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Lead inválido' }, { status: 400 })
  const r = await generarBorrador(id, 'regenerar')
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
  return NextResponse.json({ ok: true, mensaje_id: r.mensajeId })
}
