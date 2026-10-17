import { NextResponse } from 'next/server'
import { encargarWeb } from '@/lib/primera-version'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Encargar al agente» / «Reintentar» en /proyectos (cookie del hub): encargo nuevo de la primera versión.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { nota } = await req.json().catch(() => ({}))
  try {
    const r = await encargarWeb(Number(params.id), typeof nota === 'string' && nota.trim() ? nota.trim() : null)
    if ('omitido' in r) return NextResponse.json({ error: r.omitido }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo encargar' }, { status: 500 })
  }
}
