import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { esEstadoLead } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Cambio de estado a mano desde la ficha del lead. Queda en su línea de tiempo.
// «Ganado» tiene su propia ruta (crea cliente y proyecto); «perdido» admite un motivo.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { estado, motivo } = await req.json().catch(() => ({}))
  if (!esEstadoLead(estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  if (estado === 'ganado') return NextResponse.json({ error: 'Usa «Marcar ganado»' }, { status: 400 })
  const { data: antes } = await sb.from('leads').select('estado').eq('id', params.id).maybeSingle()
  if (!antes) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (antes.estado === estado) return NextResponse.json({ ok: true })
  const { error } = await sb.from('leads').update({ estado, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const nota = typeof motivo === 'string' ? motivo.trim().slice(0, 500) : ''
  await sb.from('eventos').insert(estado === 'perdido'
    ? { lead_id: Number(params.id), tipo: 'lead.perdido', fuente: 'joux-hub', datos: { de: antes.estado, ...(nota ? { motivo: nota } : {}) } }
    : { lead_id: Number(params.id), tipo: 'lead.estado', fuente: 'joux-hub', datos: { de: antes.estado, a: estado } })
  return NextResponse.json({ ok: true })
}
