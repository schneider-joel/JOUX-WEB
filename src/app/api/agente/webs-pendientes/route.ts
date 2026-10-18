import { NextRequest, NextResponse } from 'next/server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { encargosPendientes } from '@/lib/encargos-pendientes'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Webs de diseño que el agente de primera versión (/primera-version) tiene que montar. Pública en el
// middleware: valida INTAKE_KEY_AGENTE. ?proyecto_id=206 limita la lista a esa web.
// Contrato en automatizacion.md («Agente de primera versión»). Custom y treatments: encargos-pendientes.
export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  try {
    const webs = await encargosPendientes('diseno', req.nextUrl.searchParams.get('proyecto_id'))
    return NextResponse.json({ webs, caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/webs-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
