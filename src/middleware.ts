import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [/^\/ab\//, /^\/invoice\//, /^\/login$/, /^\/api\/login$/]

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
