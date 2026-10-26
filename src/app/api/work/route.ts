import { NextResponse } from 'next/server'
import { cargarWork } from '@/lib/work-datos'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la cuenta sale vieja.
export const fetchCache = 'force-no-store'

// Insignia de Work › Proyectos en el menú: cuántos leads y proyectos esperan a Joel (lo mismo que pinta /work). Solo lee.
export async function GET() {
  const { pendientes } = await cargarWork()
  return NextResponse.json({ pendientes })
}
