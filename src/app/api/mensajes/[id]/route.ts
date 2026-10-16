import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Editar un borrador (asunto y texto) o descartarlo. Solo mensajes salientes sin enviar.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { asunto, cuerpo, estado } = await req.json().catch(() => ({}))
  const { data: m } = await sb.from('mensajes').select('id, lead_id, estado, direccion, asunto, cuerpo').eq('id', params.id).maybeSingle()
  if (!m) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (m.direccion !== 'saliente' || !['borrador', 'error'].includes(m.estado)) return NextResponse.json({ error: 'Este mensaje ya no se puede cambiar' }, { status: 409 })

  if (estado === 'descartado') {
    await sb.from('mensajes').update({ estado: 'descartado' }).eq('id', m.id)
    if (m.lead_id) await sb.from('eventos').insert({ lead_id: m.lead_id, tipo: 'mensaje.descartado', fuente: 'joux-hub', datos: { mensaje_id: m.id } })
    return NextResponse.json({ ok: true })
  }
  if (typeof asunto !== 'string' || typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el asunto o el texto' }, { status: 400 })
  // Si Joel lo toca, deja de ser «tal cual la IA» (sirve para medir en la fase 5 cuántos se aprueban sin cambios).
  const editado = m.asunto !== asunto.trim() || m.cuerpo !== cuerpo
  const { error } = await sb.from('mensajes').update({ asunto: asunto.trim().slice(0, 300), cuerpo: cuerpo.slice(0, 20000), ...(editado ? { generado_por: 'joel' } : {}) }).eq('id', m.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
