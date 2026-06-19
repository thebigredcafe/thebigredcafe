import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSSRClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — load saved rules
export async function GET() {
  const auth = await createSSRClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = adminClient()
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', 'roster_rules')
    .single()

  if (error || !data) return NextResponse.json([])
  return NextResponse.json(data.value)
}

// POST — save rules
export async function POST(req: Request) {
  const auth = await createSSRClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rules = await req.json()
  const sb = adminClient()

  const { error } = await sb
    .from('app_settings')
    .upsert({ key: 'roster_rules', value: rules }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
