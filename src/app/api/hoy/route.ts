import { NextResponse } from 'next/server'
import { cargarHoy } from '@/lib/pendientes'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Hoy (rediseño, fase 4): lo que pide acción, proyectos por etapa y próximas fechas. Solo lee; con la cookie del hub.
export async function GET() {
  return NextResponse.json(await cargarHoy())
}
