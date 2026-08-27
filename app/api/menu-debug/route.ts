import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(
      'https://orders.bopple.me/api/venues/big-red-cafe/menu/categories?order_type=COLLECT',
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-AU,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Origin': 'https://bopple.app',
          'Referer': 'https://bopple.app/big-red-cafe',
        },
        cache: 'no-store',
      }
    )
    const body = await res.text()
    return NextResponse.json({ status: res.status, ok: res.ok, body: body.slice(0, 1000) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
