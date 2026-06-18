import { createClient } from '@supabase/supabase-js'
import RuleBuilder from '../RuleBuilder'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function PreferencesPage() {
  const sb = adminClient()
  const { data: staffList } = await sb
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'staff')
    .order('full_name')

  return <RuleBuilder staff={staffList ?? []} />
}
