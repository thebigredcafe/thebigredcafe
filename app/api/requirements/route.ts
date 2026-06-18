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

// GET — load all requirements
export async function GET() {
  const auth = await createSSRClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = adminClient()
  const { data, error } = await sb.from('roster_requirements').select('*').order('day_of_week').order('start_min')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — replace all requirements (full overwrite)
export async function POST(req: Request) {
  const auth = await createSSRClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows: { day_of_week: string; role: string; start_min: number; end_min: number; label?: string }[] = await req.json()

  const sb = adminClient()
  // Delete all then insert fresh
  await sb.from('roster_requirements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (rows.length > 0) {
    const { error } = await sb.from('roster_requirements').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
