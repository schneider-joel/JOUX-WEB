import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// /ab, /th y /t son los links públicos de los timesheets (protegidos por token).
// /api/bancos/cron lo llama el cron de Vercel y valida su propio CRON_SECRET.
const PUBLIC_PATHS = [/^\/(ab|th|t)\//, /^\/api\/bancos\/cron$/, /^\/invoice\//, /^\/login$/, /^\/api\/login$/, /^\/icon/, /^\/apple-icon/]

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
