import { createClient } from '@supabase/supabase-js'
import RosterGrid from './RosterGrid'

// Use service role for manager page — bypasses RLS for server-side reads
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getWeekRange() {
  const today = new Date()
  const day = today.getDay()
  const mon = new Date(today)
  mon.setDate(today.getDate() + (day === 0 ? -6 : 1 - day))
  mon.setHours(0, 0, 0, 0)
  const sat = new Date(mon)
  sat.setDate(mon.getDate() + 5)
  return {
    start: mon.toISOString().split('T')[0],
    end: sat.toISOString().split('T')[0],
  }
}

export default async function ManagerPage() {
  const supabase = adminClient()

  const [
    { data: staff },
    { data: staffRoles },
    { data: templates },
  ] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, hourly_rate, saturday_rate, is_school_student, sport_team_id, sport_teams ( id, name, sport )')
      .eq('role', 'staff')
      .order('full_name'),
    supabase.from('staff_roles').select('user_id, role, skill_level'),
    supabase.from('shift_templates').select('*'),
  ])

  const { start, end } = getWeekRange()
  const today = new Date().toISOString().split('T')[0]
  const teamIds = [...new Set((staff ?? []).map((s: any) => s.sport_team_id).filter(Boolean))] as string[]

  const [{ data: initialShifts }, { data: unavailability }, { data: fixtures }] = await Promise.all([
    supabase.from('roster_shifts').select('*').gte('date', start).lte('date', end),
    supabase.from('unavailability').select('user_id, date').gte('date', start).lte('date', end),
    teamIds.length > 0
      ? supabase.from('fixture_cache').select('team_id, date, kickoff').in('team_id', teamIds).gte('date', today)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <RosterGrid
      staff={(staff ?? []) as any}
      staffRoles={staffRoles ?? []}
      templates={templates ?? []}
      fixtures={fixtures ?? []}
      initialShifts={initialShifts ?? []}
      unavailability={unavailability ?? []}
    />
  )
}
