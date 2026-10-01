import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { eb } from '@/lib/enablebanking'
import { autorizado } from '../autorizado'

export const dynamic = 'force-dynamic'

// Inicia la autorización con el banco: devuelve la URL donde el usuario da
// el permiso; el banco vuelve a /api/bancos/callback con un código.
export async function POST(req: NextRequest) {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { aspsp, pais = 'ES', maxSegundos } = await req.json()
    const segundos = Math.min(Number(maxSegundos) || 90 * 86400, 180 * 86400)
    const state = randomUUID()
    const r = await eb<{ url: string }>('/auth', {
      method: 'POST',
      body: {
        access: { valid_until: new Date(Date.now() + segundos * 1000).toISOString() },
        aspsp: { name: aspsp, country: pais },
        state,
        redirect_url: `${req.nextUrl.origin}/api/bancos/callback`,
        psu_type: 'personal',
      },
    })
    const res = NextResponse.json({ url: r.url })
    res.cookies.set('eb_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1800, path: '/api/bancos' })
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
