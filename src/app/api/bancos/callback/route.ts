import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { eb } from '@/lib/enablebanking'
import { guardarSesion, sincronizarBancos } from '@/lib/bancos-sync'
import { autorizado } from '../autorizado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vuelta desde el banco: canjea el código por una sesión, guarda las cuentas
// y hace una primera sincronización.
export async function GET(req: NextRequest) {
  const volver = (q: string) => NextResponse.redirect(new URL(`/?tab=bancos&${q}`, req.nextUrl.origin))
  if (!autorizado()) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))
  const p = req.nextUrl.searchParams
  if (p.get('error')) return volver(`error=${encodeURIComponent(p.get('error_description') || p.get('error')!)}`)
  if (!p.get('code') || p.get('state') !== cookies().get('eb_state')?.value) return volver('error=La autorización no es válida o caducó')
  try {
    const sesion = await eb('/sessions', { method: 'POST', body: { code: p.get('code') } })
    await guardarSesion(sesion)
    await sincronizarBancos().catch(() => null)
    const res = volver('ok=1')
    res.cookies.delete({ name: 'eb_state', path: '/api/bancos' })
    return res
  } catch (e: any) {
    return volver(`error=${encodeURIComponent(e.message)}`)
  }
}
