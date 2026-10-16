import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { NOMBRE_EMAIL } from '@/lib/emails'
import { notificar } from '@/lib/push'
import { firmaValida } from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Resend avisa aquí cuando un email que mandó el hub rebota, el cliente lo marca como spam o se retrasa.
// Ruta pública (middleware): la protege la firma con RESEND_WEBHOOK_SECRET.
const MOTIVO: Record<string, { motivo: string; aviso: string }> = {
  'email.bounced': { motivo: 'Rebotado', aviso: 'Un email ha rebotado' },
  'email.complained': { motivo: 'Marcado como spam', aviso: 'Un cliente marcó un email como spam' },
  'email.delivery_delayed': { motivo: 'Entrega retrasada', aviso: 'Un email no se ha podido entregar aún' },
}

export async function POST(req: Request) {
  const secreto = process.env.RESEND_WEBHOOK_SECRET
  if (!secreto) return NextResponse.json({ error: 'Falta RESEND_WEBHOOK_SECRET' }, { status: 500 })
  const cuerpo = await req.text()
  const h = req.headers
  if (!firmaValida(cuerpo, { id: h.get('svix-id'), ts: h.get('svix-timestamp'), firma: h.get('svix-signature') }, secreto)) {
    return NextResponse.json({ error: 'Firma no válida' }, { status: 401 })
  }

  let ev: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } }
  try { ev = JSON.parse(cuerpo) } catch { return NextResponse.json({ error: 'JSON no válido' }, { status: 400 }) }
  const tipo = MOTIVO[ev.type || '']
  const idEmail = ev.data?.email_id
  // Otros eventos, o emails que no salieron del hub (p. ej. el de prueba de Resend): 200 para que no reintente.
  if (!tipo || !idEmail) return NextResponse.json({ ok: true, ignorado: true })
  const { data: m } = await sb.from('mensajes').select('id, lead_id, proyecto_id, plantilla, para, error').eq('id_proveedor', idEmail).maybeSingle()
  if (!m) return NextResponse.json({ ok: true, ignorado: true })

  const detalle = ev.data?.bounce?.message
  const motivo = detalle ? `${tipo.motivo}: ${detalle}` : tipo.motivo
  // Resend reintenta si no respondemos a tiempo: el mismo aviso dos veces no se duplica.
  if (m.error === motivo) return NextResponse.json({ ok: true, repetido: true })

  await sb.from('mensajes').update({ estado: 'error', error: motivo }).eq('id', m.id)
  await sb.from('eventos').insert({
    lead_id: m.lead_id, proyecto_id: m.proyecto_id, tipo: 'mensaje.rebotado', fuente: 'resend',
    datos: { mensaje_id: m.id, plantilla: m.plantilla, para: m.para, tipo: ev.type, motivo },
  })
  const { data: p } = m.proyecto_id ? await sb.from('proyectos').select('cliente').eq('id', m.proyecto_id).maybeSingle() : { data: null }
  await notificar({
    titulo: tipo.aviso,
    cuerpo: `${NOMBRE_EMAIL[m.plantilla || ''] || m.plantilla || 'Email'} a ${m.para}${p?.cliente ? ` (${p.cliente})` : ''}`,
    url: '/proyectos',
    etiqueta: `mensaje-${m.id}`,
  })
  return NextResponse.json({ ok: true })
}
