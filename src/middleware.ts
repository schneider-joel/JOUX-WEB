import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// /ab, /th y /t son los links públicos de los timesheets (protegidos por token).
// /api/bancos/cron lo llama el cron de Vercel y valida su propio CRON_SECRET.
// /c/<token> es el link privado de la pareja para los gastos compartidos; su
// API valida el token (o el cookie del hub) por su cuenta.
// /api/intake/lead lo llaman los Workers de las webs y valida su propia clave por fuente.
// /api/intake/evento lo llaman arkevo-revision y Pitchview, también con su clave por fuente.
// /api/cron/tick lo llama el Worker joux-cron y valida CRON_TICK_SECRET.
// /api/agente/* lo llama el agente /prueba-gratis y valida INTAKE_KEY_AGENTE.
// /datos/<token> es el formulario de datos fiscales de un cliente; su API valida el mismo token.
// /api/resend/webhook lo llama Resend (rebotes, spam) y valida su firma con RESEND_WEBHOOK_SECRET.
const PUBLIC_PATHS = [/^\/(ab|th|t|c|datos)\//, /^\/api\/datos\/[\w-]+$/, /^\/api\/bancos\/cron$/, /^\/api\/intake\/(lead|evento)$/, /^\/api\/resend\/webhook$/, /^\/api\/cron\/tick$/, /^\/api\/agente\/(pruebas-pendientes|prueba-lista|prueba-error)$/, /^\/api\/compartidos$/, /^\/invoice\//, /^\/login$/, /^\/api\/login$/, /^\/icon/, /^\/apple-icon/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(re => re.test(pathname))) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get('joux_auth')?.value
  if (cookie && process.env.APP_PASSWORD && cookie === process.env.APP_PASSWORD) {
    return NextResponse.next()
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
