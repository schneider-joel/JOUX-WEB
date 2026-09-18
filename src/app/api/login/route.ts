import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Falta configurar APP_PASSWORD en las variables de entorno' }, { status: 500 })
  }

  const { password } = await req.json()
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('joux_auth', password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  })
  return res
}
