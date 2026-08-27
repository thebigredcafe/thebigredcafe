import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_DOMAINS = ['bigredcafe.com.au', 'www.bigredcafe.com.au']

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const domain = host.split(':')[0]

  // Public marketing site — rewrite root to /site route handler
  if (PUBLIC_DOMAINS.includes(domain)) {
    const { pathname } = request.nextUrl
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/site', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
