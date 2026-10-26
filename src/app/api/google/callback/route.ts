import { NextResponse } from 'next/server'
import { CUENTA_GOOGLE, PERMISOS_GOOGLE, clienteGoogle, guardarToken, rutaCallback, stateValido } from '@/lib/google-token'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Vuelta del permiso de Google. Privada (cookie del hub, SameSite=Lax llega en esta redirección) y con
// `state` firmado. Cambia el code por el refresh token, comprueba la cuenta y lo guarda cifrado.
// Nunca se registra el token: los errores solo llevan el código de Google.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const volver = (resultado: string) => NextResponse.redirect(`${url.origin}/ajustes?google=${encodeURIComponent(resultado)}`)
  if (url.searchParams.get('error')) return volver(`cancelado`)
  if (!stateValido(url.searchParams.get('state'))) return volver('enlace caducado, vuelve a intentarlo')
  const code = url.searchParams.get('code')
  const { id, secreto } = clienteGoogle()
  if (!code || !id || !secreto) return volver('faltan datos')

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secreto, redirect_uri: rutaCallback(url.origin), grant_type: 'authorization_code' }),
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!j.refresh_token || !j.access_token) return volver(`Google no dio permiso (${j.error || r.status})`)

  // La cuenta tiene que ser joel@: los alias de «Enviar como» y las carpetas de Drive son suyos.
  const perfil = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${j.access_token}` }, cache: 'no-store' })
    .then(x => x.json()).catch(() => ({}))
  const cuenta = String(perfil?.emailAddress || '').toLowerCase()
  if (cuenta !== CUENTA_GOOGLE) return volver(`hay que entrar con ${CUENTA_GOOGLE}${cuenta ? `, no con ${cuenta}` : ''}`)

  const permisos = String(j.scope || '').split(' ').filter(Boolean)
  const faltan = PERMISOS_GOOGLE.filter(p => !permisos.includes(p))
  if (faltan.some(p => p.includes('gmail'))) return volver('faltan los permisos de Gmail: marca todas las casillas')
  try {
    await guardarToken(j.refresh_token, cuenta, permisos)
  } catch (e: any) {
    console.error('google/callback', e?.message)
    return volver('no se pudo guardar')
  }
  return volver(faltan.length ? 'ok-sin-drive' : 'ok')
}
