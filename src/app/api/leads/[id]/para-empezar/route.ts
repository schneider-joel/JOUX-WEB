import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { PARA_EMPEZAR, type ParaEmpezar } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Para empezar» a mano (rediseño comercial, fase 3): Joel marca o desmarca una cosa de la lista de su marca.
// Lo que marca Joel queda como suyo (`por: 'joel'`) y la IA ya no lo cambia.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { clave, ok } = await req.json().catch(() => ({}))
  const { data: lead } = await sb.from('leads').select('marca, para_empezar').eq('id', params.id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (typeof ok !== 'boolean' || !(PARA_EMPEZAR[lead.marca] || []).some(i => i.clave === clave)) return NextResponse.json({ error: 'Dato inválido' }, { status: 400 })
  const pe: ParaEmpezar = { ...((lead.para_empezar as ParaEmpezar | null) || {}), [clave]: { ok, por: 'joel' } }
  const { error } = await sb.from('leads').update({ para_empezar: pe, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, para_empezar: pe })
}
