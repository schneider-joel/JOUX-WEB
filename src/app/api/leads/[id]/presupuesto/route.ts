import { NextResponse } from 'next/server'
import { anularPresupuesto, crearPresupuesto } from '@/lib/presupuestos'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

// Ficha del lead: «Preparar presupuesto» (POST) y «Anular» (DELETE ?p=<id>). Privada (cookie del hub).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  const num = (v: unknown) => v === '' || v == null ? null : Number(String(v).replace(',', '.'))
  const r = await crearPresupuesto(Number(params.id), {
    concepto: String(b.concepto ?? ''), plan: b.plan ? String(b.plan) : null, precio: num(b.precio), tarifa_dia: num(b.tarifa_dia), dias: num(b.dias),
    incluye: b.incluye ? String(b.incluye) : null, plazo: b.plazo ? String(b.plazo) : null, caduca: b.caduca ? String(b.caduca) : null, idioma: b.idioma ? String(b.idioma) : null,
  })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, id: r.p.id, token: r.p.token })
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('p'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta el presupuesto' }, { status: 400 })
  const r = await anularPresupuesto(id)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
