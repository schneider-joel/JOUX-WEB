import { NextResponse } from 'next/server'
import { CUENTA_GOOGLE, PERMISOS_GOOGLE, clienteGoogle, firmarState, rutaCallback } from '@/lib/google-token'

export const dynamic = 'force-dynamic'

// «Reconectar Google» (Ajustes): manda a Joel al permiso de Google. Privada (cookie del hub).
// offline + consent: sin esto Google no devuelve refresh token.
export async function GET(req: Request) {
  const { id } = clienteGoogle()
  if (!id) return NextResponse.json({ error: 'Falta GMAIL_CLIENT_ID' }, { status: 500 })
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: rutaCallback(new URL(req.url).origin), response_type: 'code', scope: PERMISOS_GOOGLE.join(' '),
    access_type: 'offline', prompt: 'consent', login_hint: CUENTA_GOOGLE, state: firmarState(),
  })
  return NextResponse.redirect(url)
}
