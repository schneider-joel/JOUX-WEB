import { NextRequest, NextResponse } from 'next/server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { cambiosPendientes } from '@/lib/cartela-agente'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Peticiones de cambio de Cartela para el agente (fotos con URL firmada de 1 h). `pausado: true` = el paso «Cambios»
// del piloto está apagado: el agente no hace nada. Responde con cambio-empezado / cambio-hecho / cambio-escalado.
export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  try {
    return NextResponse.json({ ...(await cambiosPendientes()), caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/cambios-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
