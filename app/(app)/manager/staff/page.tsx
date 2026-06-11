import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ROLE_LABELS, ROLES } from '@/lib/types'

export default async function StaffPage() {
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('profiles')
    .select(`
      id, full_name, email, employment_type, hourly_rate,
      min_hours_week, max_hours_week,
      sport_team_id,
      sport_teams ( id, name, sport )
    `)
    .eq('role', 'staff')
    .order('full_name')

  const { data: staffRoles } = await supabase
    .from('staff_roles')
    .select('user_id, role, skill_level')

  const rolesByUser = (staffRoles ?? []).reduce<Record<string, typeof staffRoles>>((acc, r) => {
    if (!r) return acc
    if (!acc[r.user_id]) acc[r.user_id] = []
    acc[r.user_id]!.push(r)
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">{staff?.length ?? 0} staff members</p>
        </div>
        <Link href="/manager/staff/bulk"
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
          Bulk edit
        </Link>
      </div>

      <div className="space-y-3">
        {staff?.map(member => {
          const roles = rolesByUser[member.id] ?? []
          return (
            <Link
              key={member.id}
              href={`/manager/staff/${member.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
                    {(member as any).sport_teams && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {(member as any).sport_teams.sport} · {(member as any).sport_teams.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
                  {roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {roles.map((r: any) => (
                        <span key={r.role} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]} · {'★'.repeat(r.skill_level)}{'☆'.repeat(5 - r.skill_level)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right ml-4 shrink-0">
                  {member.hourly_rate && (
                    <p className="text-sm font-medium text-gray-700">${member.hourly_rate}/hr</p>
                  )}
                  {(member.min_hours_week || member.max_hours_week) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {member.min_hours_week ?? '?'}–{member.max_hours_week ?? '?'}h/wk
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {member.employment_type?.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
        {(!staff || staff.length === 0) && (
          <p className="text-sm text-gray-400">No staff yet. Staff will appear here after they sign up.</p>
        )}
      </div>
    </div>
  )
}
