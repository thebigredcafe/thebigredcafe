import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_DOMAINS = ['bigredcafe.com.au', 'www.bigredcafe.com.au']

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const domain = host.split(':')[0]

  // Public marketing site — serve directly without auth checks
  if (PUBLIC_DOMAINS.includes(domain)) {
    const { pathname } = request.nextUrl
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = new URL(request.url)
      rewriteUrl.pathname = '/site'
      return NextResponse.rewrite(rewriteUrl)
    }
    // Allow all other paths on public domain through unchanged
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
