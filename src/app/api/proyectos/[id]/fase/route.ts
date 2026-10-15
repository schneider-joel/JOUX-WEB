import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { esFaseProyecto } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Fase de seguimiento a mano desde Pipeline. Solo toca `fase` (no `status`, que dispara facturas).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { fase } = await req.json().catch(() => ({}))
  if (!esFaseProyecto(fase)) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
  const { data: antes } = await sb.from('proyectos').select('fase, lead_id').eq('id', params.id).maybeSingle()
  if (!antes) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (antes.fase === fase) return NextResponse.json({ ok: true })
  const { error } = await sb.from('proyectos').update({ fase }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from('eventos').insert({ proyecto_id: Number(params.id), lead_id: antes.lead_id, tipo: 'proyecto.fase', fuente: 'joux-hub', datos: { de: antes.fase, a: fase } })
  return NextResponse.json({ ok: true })
}
