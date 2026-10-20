import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarMensajeLead } from '@/lib/enviar-lead'
import { remitenteLead } from '@/lib/remitentes'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Enviar» en el panel de conversación de la ficha del proyecto: un email escrito por Joel al cliente.
// Va por Gmail en el hilo del lead, con el alias de la marca (el mismo envío que «Respuesta» en la ficha
// del lead): se guarda como borrador y enviarMensajeLead lo reserva y lo manda, así un doble toque no
// manda dos. Sin lead no hay hilo: se escribe desde Gmail.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { cuerpo } = await req.json().catch(() => ({}))
  if (typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el texto' }, { status: 400 })
  const { data: p } = await sb.from('proyectos').select('id, nombre, lead_id, contacto_email').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'No existe el proyecto' }, { status: 404 })
  if (!p.lead_id) return NextResponse.json({ error: 'Este proyecto no tiene lead: escríbele desde Gmail' }, { status: 400 })
  const { data: lead } = await sb.from('leads').select('id, email, marca, idioma').eq('id', p.lead_id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'No existe el lead' }, { status: 404 })
  const remitente = remitenteLead(lead.marca, lead.idioma)
  if (!remitente) return NextResponse.json({ error: 'Esta marca no tiene remitente de Gmail' }, { status: 400 })

  // Mismo asunto que el último email del hilo (enviarMensajeLead le pone «Re:»).
  const { data: ultimo } = await sb.from('mensajes').select('asunto').eq('lead_id', lead.id).not('asunto', 'is', null)
    .in('estado', ['enviado', 'recibido']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const asunto = (ultimo?.asunto || p.nombre).replace(/^(re:\s*)+/i, '').slice(0, 300)

  const { data: m, error } = await sb.from('mensajes').insert({
    lead_id: lead.id, proyecto_id: p.id, direccion: 'saliente', estado: 'borrador', generado_por: 'joel', canal: 'gmail',
    remitente, para: p.contacto_email || lead.email, asunto, cuerpo: cuerpo.slice(0, 20000),
  }).select('id').single()
  if (error || !m) return NextResponse.json({ error: error?.message || 'No se pudo guardar' }, { status: 500 })
  const r = await enviarMensajeLead(m.id, ['borrador'])
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
