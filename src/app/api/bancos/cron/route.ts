import { NextRequest, NextResponse } from 'next/server'
import { sincronizarBancos } from '@/lib/bancos-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sincronización diaria (vercel.json). Vercel manda "Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await sincronizarBancos())
}
