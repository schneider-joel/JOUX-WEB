import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { NOMBRE_EMAIL, pendientes } from '@/lib/emails'
import { enviarEmailProyecto, plantillaProyecto } from '@/lib/emails-proyecto'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Borrador guardado de este proyecto (los que prepara un aviso de revisión o el cron).
const borrador = (proyecto: string, id: unknown) => sb.from('mensajes').select('id, plantilla, remitente, para, asunto, cuerpo')
  .eq('id', Number(id)).eq('proyecto_id', proyecto).eq('estado', 'borrador').maybeSingle()

// Borrador del email: el guardado (?mensaje=) o la plantilla rellenada salvo {{url}}, para revisarlo antes de enviar.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const q = new URL(req.url).searchParams
  if (q.get('mensaje')) {
    const { data: m } = await borrador(params.id, q.get('mensaje'))
    if (!m) return NextResponse.json({ error: 'Ese borrador ya no está pendiente' }, { status: 404 })
    return NextResponse.json({ remitente: m.remitente, para: m.para, asunto: m.asunto, cuerpo: m.cuerpo })
  }
  const clave = q.get('clave') || ''
  if (!NOMBRE_EMAIL[clave]) return NextResponse.json({ error: 'Email desconocido' }, { status: 400 })
  const d = await plantillaProyecto(params.id, clave)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
  return NextResponse.json({ remitente: d.t.remitente, para: d.p.contacto_email || '', asunto: d.asunto, cuerpo: d.cuerpo })
}

// Envía el email tal como lo dejó Joel y lo guarda en `mensajes` (sobre el borrador, si venía de uno) y en la línea de tiempo.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { clave, para, asunto, cuerpo, mensaje } = await req.json().catch(() => ({}))
  if (!NOMBRE_EMAIL[clave]) return NextResponse.json({ error: 'Email desconocido' }, { status: 400 })
  if (typeof para !== 'string' || !EMAIL.test(para.trim())) return NextResponse.json({ error: 'Falta un email válido' }, { status: 400 })
  if (typeof asunto !== 'string' || !asunto.trim() || typeof cuerpo !== 'string' || !cuerpo.trim()) return NextResponse.json({ error: 'Falta el asunto o el texto' }, { status: 400 })
  const faltan = pendientes(asunto + cuerpo)
  if (faltan.length) return NextResponse.json({ error: `Falta rellenar ${faltan.join(', ')}` }, { status: 400 })
  const d = await plantillaProyecto(params.id, clave)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })

  let mensajeId: number | undefined
  if (mensaje != null) {
    // Se reserva el borrador antes de enviar: dos toques seguidos no mandan dos emails.
    const { data: reservado } = await sb.from('mensajes').update({ estado: 'aprobado' }).eq('id', Number(mensaje)).eq('proyecto_id', params.id).eq('estado', 'borrador').select('id')
    if (!reservado?.length) return NextResponse.json({ error: 'Ese borrador ya no está pendiente' }, { status: 409 })
    mensajeId = reservado[0].id
  }

  const destino = para.trim()
  const envio = await enviarEmailProyecto({ proyectoId: d.p.id, leadId: d.p.lead_id, clave, remitente: d.t.remitente, para: destino, asunto: asunto.trim(), cuerpo, mensajeId })
  if (envio.error) return NextResponse.json({ error: `No se envió: ${envio.error}` }, { status: 502 })
  if (!d.p.contacto_email) await sb.from('proyectos').update({ contacto_email: destino }).eq('id', d.p.id)
  return NextResponse.json({ ok: true })
}

// Descarta un borrador guardado (?mensaje=).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(new URL(req.url).searchParams.get('mensaje'))
  const { data } = await sb.from('mensajes').update({ estado: 'descartado' }).eq('id', id).eq('proyecto_id', params.id).eq('estado', 'borrador').select('id')
  if (!data?.length) return NextResponse.json({ error: 'Ese borrador ya no está pendiente' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
