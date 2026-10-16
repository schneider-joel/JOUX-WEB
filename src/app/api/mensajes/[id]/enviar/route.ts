import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarMensajeLead } from '@/lib/enviar-lead'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Enviar» en la ficha del lead: guarda el texto tal como lo dejó Joel y lo manda por Gmail con el
// alias de la marca. Bloqueado mientras quede alguna marca [[Joel: …]].
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { asunto, cuerpo } = await req.json().catch(() => ({}))
  if (typeof asunto !== 'string' || !asunto.trim() || typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el asunto o el texto' }, { status: 400 })
  if (/\[\[Joel:/.test(asunto + cuerpo)) return NextResponse.json({ error: 'Quedan marcas [[Joel: …]] por rellenar' }, { status: 400 })
  const { data: m } = await sb.from('mensajes').select('id, estado, asunto, cuerpo').eq('id', id).maybeSingle()
  if (!m) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!['borrador', 'error'].includes(m.estado)) return NextResponse.json({ error: 'Este mensaje ya no está pendiente' }, { status: 409 })
  // generado_por pasa a «joel» si cambió el texto: así se mide cuántos borradores de IA salen tal cual.
  const editado = m.asunto !== asunto.trim() || m.cuerpo !== cuerpo
  await sb.from('mensajes').update({ asunto: asunto.trim().slice(0, 300), cuerpo: cuerpo.slice(0, 20000), ...(editado ? { generado_por: 'joel' } : {}) }).eq('id', id)
  const r = await enviarMensajeLead(id, ['borrador', 'error'])
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
