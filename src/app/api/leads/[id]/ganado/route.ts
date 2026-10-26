import { NextResponse } from 'next/server'
import type { FormGanado } from '@/lib/ganado'
import { ganarLead } from '@/lib/ganar'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Marcar ganado»: cliente fiscal (si es nuevo) + proyecto en fase «confirmado» + lead ganado + evento
// (ganarLead() en src/lib/ganar.ts, común con el piloto automático).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const form = await req.json().catch(() => null) as FormGanado | null
  if (!form || typeof form.cliente !== 'string') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const r = await ganarLead(params.id, form)
  if ('error' in r) return NextResponse.json({ error: r.error, ...(r.proyecto_id ? { proyecto_id: r.proyecto_id } : {}) }, { status: r.status })
  return NextResponse.json(r)
}
