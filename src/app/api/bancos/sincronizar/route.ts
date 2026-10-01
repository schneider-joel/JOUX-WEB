import { NextResponse } from 'next/server'
import { sincronizarBancos } from '@/lib/bancos-sync'
import { autorizado } from '../autorizado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await sincronizarBancos())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
