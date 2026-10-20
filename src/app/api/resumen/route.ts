import { NextResponse } from 'next/server'
import { resumenDiario, vistaPreviaResumen } from '@/lib/resumen'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Enviar resumen ahora» en /ajustes: el resumen de hoy por push y email, aunque no haya nada. No cuenta
// como el envío del día (el de las 8:00 sale igual).
export async function POST() {
  const r = await resumenDiario({ forzar: true })
  if ('email' in r && r.email?.error) return NextResponse.json({ error: `Email: ${r.email.error}`, push: r.push }, { status: 502 })
  return NextResponse.json(r)
}

// Vista previa del resumen de hoy (asunto, push y texto), sin enviar nada.
export async function GET() {
  return NextResponse.json(await vistaPreviaResumen())
}
