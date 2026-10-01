import { NextRequest, NextResponse } from 'next/server'
import { eb, type Aspsp } from '@/lib/enablebanking'
import { autorizado } from '../autorizado'

export const dynamic = 'force-dynamic'

// Bancos disponibles en un país (para elegir cuál conectar).
export async function GET(req: NextRequest) {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const pais = req.nextUrl.searchParams.get('country') || 'ES'
    const { aspsps } = await eb<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(pais)}`)
    return NextResponse.json({ aspsps: aspsps.filter(a => !a.psu_types || a.psu_types.includes('personal')) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
