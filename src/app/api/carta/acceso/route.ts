import { NextResponse } from 'next/server'
import { autorizarCarta, enviarAcceso, entrar } from '@/lib/cartela-acceso'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Acceso a los cambios desde la carta (lo llama el Worker de la carta con CARTELA_CARTAS_KEY).
// { slug, accion: 'enviar' } → manda el enlace al correo del local · { slug, accion: 'entrar', k } → sesión nueva.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const a = await autorizarCarta(req, typeof body?.slug === 'string' ? body.slug : null, false)
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  if (a.local.estado === 'pausado') return NextResponse.json({ error: 'pausado' }, { status: 403 })
  if (body.accion === 'enviar') {
    const r = await enviarAcceso(a.local)
    return r.ok ? NextResponse.json({ ok: true, correo: r.correo }) : NextResponse.json({ error: r.error }, { status: r.status })
  }
  if (body.accion === 'entrar') {
    const r = await entrar(a.local, String(body.k ?? ''), typeof body.dispositivo === 'string' ? body.dispositivo : null)
    return r.ok ? NextResponse.json({ ok: true, sesion: r.sesion, dias: r.dias }) : NextResponse.json({ error: r.error }, { status: r.status })
  }
  return NextResponse.json({ error: 'accion' }, { status: 400 })
}
