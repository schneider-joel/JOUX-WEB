import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'

export const dynamic = 'force-dynamic'

// Guarda la suscripción push de este dispositivo (protegido por el cookie del
// hub en el middleware). Con { prueba: true } manda una notificación de prueba.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (body.prueba) {
    const enviadas = await notificar({ titulo: 'JOUX Hub', cuerpo: 'Las notificaciones funcionan. Te avisaré de cada cobro que llegue.', url: '/?tab=facturas', etiqueta: 'prueba' })
    return NextResponse.json({ enviadas })
  }
  const s = body.suscripcion
  if (!s?.endpoint || !s?.keys) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  const { error } = await sb.from('push_suscripciones').upsert({ endpoint: s.endpoint, keys: s.keys, dispositivo: body.dispositivo || null }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}))
  if (endpoint) await sb.from('push_suscripciones').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
