'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ROLES, ROLE_LABELS } from '@/lib/types'
import type { Role } from '@/lib/types'

interface SportTeam { id: string; name: string; sport: string }
interface StaffRow {
  id: string
  full_name: string
  employment_type: string
  hourly_rate: string
  saturday_rate: string
  public_holiday_rate: string
  min_hours_week: string
  max_hours_week: string
  sport_team_id: string
  preference: number | null
  roles: Record<Role, number | null>
}

const SPORT_LABELS: Record<string, string> = { soccer: 'Soccer', rugby: 'Rugby', netball: 'Netball' }

const PREF_LABELS = ['', 'Low', 'Below avg', 'Average', 'Preferred', 'Top pick']
const PREF_COLORS = [
  '',
  'bg-red-100 text-red-600 hover:bg-red-200',
  'bg-orange-100 text-orange-600 hover:bg-orange-200',
  'bg-gray-100 text-gray-600 hover:bg-gray-200',
  'bg-blue-100 text-blue-700 hover:bg-blue-200',
  'bg-green-100 text-green-700 hover:bg-green-200',
]

export default function BulkStaffPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [teams, setTeams] = useState<SportTeam[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: staffRoles }, { data: sportTeams }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, employment_type, hourly_rate, saturday_rate, public_holiday_rate, min_hours_week, max_hours_week, sport_team_id, preference').eq('role', 'staff').order('full_name'),
        supabase.from('staff_roles').select('user_id, role, skill_level'),
        supabase.from('sport_teams').select('id, name, sport').order('sport').order('name'),
      ])

      if (sportTeams) setTeams(sportTeams)

      if (profiles) {
        const roleMap = (staffRoles ?? []).reduce<Record<string, Record<string, number>>>((acc, r) => {
          if (!acc[r.user_id]) acc[r.user_id] = {}
          acc[r.user_id][r.role] = r.skill_level
          return acc
        }, {})

        setStaff(profiles.map(p => ({
          id: p.id,
          full_name: p.full_name,
          employment_type: p.employment_type ?? 'casual',
          hourly_rate: p.hourly_rate?.toString() ?? '',
          saturday_rate: (p as any).saturday_rate?.toString() ?? '',
          public_holiday_rate: (p as any).public_holiday_rate?.toString() ?? '',
          min_hours_week: p.min_hours_week?.toString() ?? '',
          max_hours_week: p.max_hours_week?.toString() ?? '',
          sport_team_id: p.sport_team_id ?? '',
          preference: (p as any).preference ?? null,
          roles: Object.fromEntries(ROLES.map(r => [r, roleMap[p.id]?.[r] ?? null])) as Record<Role, number | null>,
        })))
      }
      setLoading(false)
    }
    load()
  }, [])

  function update(id: string, field: keyof Omit<StaffRow, 'id' | 'full_name' | 'roles' | 'preference' | never>, value: string) {
    setStaff(s => s.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  function cycleRole(id: string, role: Role) {
    setStaff(s => s.map(row => {
      if (row.id !== id) return row
      const current = row.roles[role]
      const next = current === null ? 1 : current === 5 ? null : current + 1
      return { ...row, roles: { ...row.roles, [role]: next } }
    }))
  }

  function cyclePref(id: string) {
    setStaff(s => s.map(row => {
      if (row.id !== id) return row
      const current = row.preference
      const next = current === null ? 1 : current === 5 ? null : current + 1
      return { ...row, preference: next }
    }))
  }

  async function saveAll() {
    setSaving(true)
    for (const row of staff) {
      await supabase.from('profiles').update({
        employment_type: row.employment_type,
        hourly_rate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
        saturday_rate: row.saturday_rate ? parseFloat(row.saturday_rate) : null,
        public_holiday_rate: row.public_holiday_rate ? parseFloat(row.public_holiday_rate) : null,
        min_hours_week: row.min_hours_week ? parseFloat(row.min_hours_week) : null,
        max_hours_week: row.max_hours_week ? parseFloat(row.max_hours_week) : null,
        sport_team_id: row.sport_team_id || null,
        preference: row.preference,
      }).eq('id', row.id)

      await supabase.from('staff_roles').delete().eq('user_id', row.id)
      const assigned = ROLES.filter(r => row.roles[r] !== null).map(r => ({ user_id: row.id, role: r, skill_level: row.roles[r]! }))
      if (assigned.length > 0) await supabase.from('staff_roles').insert(assigned)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const grouped = teams.reduce<Record<string, SportTeam[]>>((acc, t) => {
    if (!acc[t.sport]) acc[t.sport] = []
    acc[t.sport].push(t)
    return acc
  }, {})

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Staff — Bulk Edit</h1>
          <p className="text-xs text-gray-400 mt-0.5">Click badges to cycle values. Preference = who you prefer to roster first.</p>
        </div>
        <button onClick={saveAll} disabled={saving}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap sticky left-0 bg-gray-50 z-10">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">$/hr</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">$/Sat</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">$/PH</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">Min h</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">Max h</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">Sport</th>
              {ROLES.map(r => (
                <th key={r} className="text-center text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap min-w-[80px]">
                  {ROLE_LABELS[r]}
                </th>
              ))}
              <th className="text-center text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap min-w-[90px]">Preference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                {/* Name */}
                <td className={`px-3 py-2 font-medium text-gray-900 whitespace-nowrap sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  {row.full_name}
                </td>

                {/* Employment type */}
                <td className="px-3 py-2">
                  <select value={row.employment_type} onChange={e => update(row.id, 'employment_type', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white w-24">
                    <option value="casual">Casual</option>
                    <option value="part_time">Part time</option>
                    <option value="full_time">Full time</option>
                  </select>
                </td>

                {/* Hourly rate */}
                <td className="px-3 py-2">
                  <input type="number" step="0.01" placeholder="0.00" value={row.hourly_rate}
                    onChange={e => update(row.id, 'hourly_rate', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-16 text-right" />
                </td>

                {/* Saturday rate */}
                <td className="px-3 py-2">
                  <input type="number" step="0.01" placeholder="0.00" value={row.saturday_rate}
                    onChange={e => update(row.id, 'saturday_rate', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-16 text-right" />
                </td>

                {/* Public holiday rate */}
                <td className="px-3 py-2">
                  <input type="number" step="0.01" placeholder="0.00" value={row.public_holiday_rate}
                    onChange={e => update(row.id, 'public_holiday_rate', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-16 text-right" />
                </td>

                {/* Min hours */}
                <td className="px-3 py-2">
                  <input type="number" step="0.5" placeholder="–" value={row.min_hours_week}
                    onChange={e => update(row.id, 'min_hours_week', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-14 text-right" />
                </td>

                {/* Max hours */}
                <td className="px-3 py-2">
                  <input type="number" step="0.5" placeholder="–" value={row.max_hours_week}
                    onChange={e => update(row.id, 'max_hours_week', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-14 text-right" />
                </td>

                {/* Sport team */}
                <td className="px-3 py-2">
                  <select value={row.sport_team_id} onChange={e => update(row.id, 'sport_team_id', e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white w-28">
                    <option value="">–</option>
                    {Object.entries(grouped).map(([sport, ts]) => (
                      <optgroup key={sport} label={SPORT_LABELS[sport] ?? sport}>
                        {ts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>

                {/* Role skill badges */}
                {ROLES.map(role => {
                  const level = row.roles[role]
                  return (
                    <td key={role} className="px-3 py-2 text-center">
                      <button onClick={() => cycleRole(row.id, role)}
                        title={level === null ? `Add ${ROLE_LABELS[role]}` : `Skill ${level} — click to change`}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 h-7 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                          level === null
                            ? 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-500'
                            : level <= 2
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : level <= 3
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}>
                        {level === null ? <span className="text-gray-300">off</span> : (
                          <>
                            <span>{'★'.repeat(level)}{'☆'.repeat(5 - level)}</span>
                            <span className="font-semibold">{level}</span>
                          </>
                        )}
                      </button>
                    </td>
                  )
                })}

                {/* Preference */}
                <td className="px-3 py-2 text-center">
                  <button onClick={() => cyclePref(row.id)}
                    title={row.preference === null ? 'Set preference' : `${PREF_LABELS[row.preference]} — click to change`}
                    className={`inline-flex items-center justify-center px-3 h-7 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      row.preference === null
                        ? 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-500'
                        : PREF_COLORS[row.preference]
                    }`}>
                    {row.preference === null ? '–' : PREF_LABELS[row.preference]}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button onClick={saveAll} disabled={saving}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save all'}
        </button>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">★★☆☆☆ <b>1–2</b></span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">★★★☆☆ <b>3</b></span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700">★★★★★ <b>4–5</b></span>
          <span className="text-gray-300 ml-2">· click any badge to cycle, click 5 to remove</span>
        </div>
      </div>
    </div>
  )
}
