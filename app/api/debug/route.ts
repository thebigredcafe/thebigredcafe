import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing env vars', url: !!url, key: !!key })
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error, count } = await sb.from('profiles').select('id, full_name, role', { count: 'exact' }).eq('role', 'staff')

  return NextResponse.json({
    url,
    keyPrefix: key.slice(0, 12) + '...',
    staffCount: count,
    sample: data?.slice(0, 3),
    error: error?.message,
  })
}
