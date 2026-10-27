import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// /ab, /th y /t son los links públicos de los timesheets (protegidos por token).
// /api/bancos/cron lo llama el cron de Vercel y valida su propio CRON_SECRET.
// /c/<token> es el link privado de la pareja para los gastos compartidos; su
// API valida el token (o el cookie del hub) por su cuenta.
// /api/intake/lead lo llaman los Workers de las webs y valida su propia clave por fuente.
// /api/intake/evento lo llaman arkevo-revision y Pitchview, también con su clave por fuente.
// /api/cron/tick lo llama el Worker joux-cron y valida CRON_TICK_SECRET.
// /api/agente/* lo llaman los agentes (/prueba-gratis, /primera-version, custom, treatment y cambios de Cartela) y valida INTAKE_KEY_AGENTE.
// /cambios/<token> es el enlace de cambios de un local de Cartela; su API valida el mismo token.
// /fonts/ son las fuentes de esas páginas públicas.
// /datos/<token> es el formulario de datos fiscales de un cliente; su API valida el mismo token.
// /api/resend/webhook lo llama Resend (rebotes, spam) y valida su firma con RESEND_WEBHOOK_SECRET.
const PUBLIC_PATHS = [/^\/(ab|th|t|c|datos|cambios)\//, /^\/api\/datos\/[\w-]+$/, /^\/api\/cambios\/[0-9a-f]+(\/qr)?$/, /^\/api\/bancos\/cron$/, /^\/api\/intake\/(lead|evento)$/, /^\/api\/resend\/webhook$/, /^\/api\/cron\/tick$/, /^\/api\/agente\/(pruebas-pendientes|prueba-lista|prueba-error|webs-pendientes|encargos-pendientes|web-empezada|web-lista|web-error|cambios-pendientes|cambio-empezado|cambio-hecho|cambio-escalado)$/, /^\/api\/compartidos$/, /^\/invoice\//, /^\/login$/, /^\/api\/login$/, /^\/icon/, /^\/apple-icon/, /^\/sw\.js$/, /^\/fonts\//, /^\/manifest\.webmanifest$/]

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
