import { NextResponse } from 'next/server'
import { aceptarPresupuesto } from '@/lib/presupuestos'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

// Aceptación pública de un presupuesto (/aceptar/<token>). Público en el middleware: el token es la llave.
// La IP y el navegador van a la prueba de la aceptación. Errores con claves cortas que traduce la página.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'datos' }, { status: 400 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const r = await aceptarPresupuesto(params.token, { nombre: String(body.nombre ?? ''), acepto: body.acepto === true, ip, ua: req.headers.get('user-agent') })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
