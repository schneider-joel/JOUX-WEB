import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarMensajeLead } from '@/lib/enviar-lead'
import { remitenteLead } from '@/lib/remitentes'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Enviar» en el panel de conversación de la ficha del lead: un email escrito por Joel. Mismo envío que la
// ficha del proyecto (POST /api/proyectos/[id]/mensaje): se guarda como borrador y enviarMensajeLead lo
// reserva y lo manda por Gmail en el hilo del lead, con el alias de la marca.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { cuerpo } = await req.json().catch(() => ({}))
  if (typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el texto' }, { status: 400 })
  const { data: lead } = await sb.from('leads').select('id, email, marca, idioma, proyecto_id, empresa, nombre').eq('id', id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'No existe el lead' }, { status: 404 })
  const remitente = remitenteLead(lead.marca, lead.idioma)
  if (!remitente) return NextResponse.json({ error: 'Esta marca no tiene remitente de Gmail' }, { status: 400 })

  // Mismo asunto que el último email del hilo (enviarMensajeLead le pone «Re:»).
  const { data: ultimo } = await sb.from('mensajes').select('asunto').eq('lead_id', lead.id).not('asunto', 'is', null)
    .in('estado', ['enviado', 'recibido']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const asunto = (ultimo?.asunto || lead.empresa || lead.nombre || 'Tu consulta').replace(/^(re:\s*)+/i, '').slice(0, 300)

  const { data: m, error } = await sb.from('mensajes').insert({
    lead_id: lead.id, proyecto_id: lead.proyecto_id, direccion: 'saliente', estado: 'borrador', generado_por: 'joel', canal: 'gmail',
    remitente, para: lead.email, asunto, cuerpo: cuerpo.slice(0, 20000),
  }).select('id').single()
  if (error || !m) return NextResponse.json({ error: error?.message || 'No se pudo guardar' }, { status: 500 })
  const r = await enviarMensajeLead(m.id, ['borrador'])
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
