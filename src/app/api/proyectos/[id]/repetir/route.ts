import { NextResponse } from 'next/server'
import { repetirCarta } from '@/lib/primera-version'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Repetir» de una carta de Cartela en revisión (cookie del hub): encargo de la pasada siguiente con las correcciones.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { texto } = await req.json().catch(() => ({}))
  if (typeof texto !== 'string') return NextResponse.json({ error: 'Escribe las correcciones' }, { status: 400 })
  try {
    const r = await repetirCarta(Number(params.id), texto)
    if ('omitido' in r) return NextResponse.json({ error: r.omitido }, { status: 400 })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo encargar' }, { status: 500 })
  }
}
