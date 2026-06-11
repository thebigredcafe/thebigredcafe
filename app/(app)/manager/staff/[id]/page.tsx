'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ROLES, ROLE_LABELS } from '@/lib/types'
import type { Role } from '@/lib/types'

interface SportTeam { id: string; name: string; sport: string }
interface StaffRole { role: Role; skill_level: number }

export default function EditStaffPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [teams, setTeams] = useState<SportTeam[]>([])

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    employment_type: 'casual',
    hourly_rate: '',
    min_hours_week: '',
    max_hours_week: '',
    sport_team_id: '',
  })

  const [roles, setRoles] = useState<StaffRole[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: profile }, { data: staffRoles }, { data: sportTeams }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('staff_roles').select('role, skill_level').eq('user_id', id),
        supabase.from('sport_teams').select('id, name, sport').order('name'),
      ])

      if (profile) {
        setForm({
          full_name: profile.full_name ?? '',
          email: profile.email ?? '',
          phone: profile.phone ?? '',
          employment_type: profile.employment_type ?? 'casual',
          hourly_rate: profile.hourly_rate?.toString() ?? '',
          min_hours_week: profile.min_hours_week?.toString() ?? '',
          max_hours_week: profile.max_hours_week?.toString() ?? '',
          sport_team_id: profile.sport_team_id ?? '',
        })
      }

      if (staffRoles) setRoles(staffRoles)
      if (sportTeams) setTeams(sportTeams)
      setLoading(false)
    }
    load()
  }, [id])

  function toggleRole(role: Role) {
    setRoles(r => r.find(x => x.role === role)
      ? r.filter(x => x.role !== role)
      : [...r, { role, skill_level: 3 }]
    )
  }

  function setSkill(role: Role, level: number) {
    setRoles(r => r.map(x => x.role === role ? { ...x, skill_level: level } : x))
  }

  async function save() {
    setSaving(true)

    await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone || null,
      employment_type: form.employment_type,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      min_hours_week: form.min_hours_week ? parseFloat(form.min_hours_week) : null,
      max_hours_week: form.max_hours_week ? parseFloat(form.max_hours_week) : null,
      sport_team_id: form.sport_team_id || null,
    }).eq('id', id)

    await supabase.from('staff_roles').delete().eq('user_id', id)
    if (roles.length > 0) {
      await supabase.from('staff_roles').insert(
        roles.map(r => ({ user_id: id, role: r.role, skill_level: r.skill_level }))
      )
    }

    setSaving(false)
    router.push('/manager/staff')
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-900">← Back</button>
        <h1 className="text-xl font-semibold text-gray-900">{form.full_name}</h1>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Employment type</label>
              <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2">
                <option value="casual">Casual</option>
                <option value="part_time">Part time</option>
                <option value="full_time">Full time</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hourly rate ($)</label>
              <input type="number" step="0.01" value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min hours/week</label>
              <input type="number" step="0.5" value={form.min_hours_week}
                onChange={e => setForm(f => ({ ...f, min_hours_week: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max hours/week</label>
              <input type="number" step="0.5" value={form.max_hours_week}
                onChange={e => setForm(f => ({ ...f, max_hours_week: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
          </div>
        </section>

        {/* Sport team */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Sport Team</p>
          <select value={form.sport_team_id}
            onChange={e => setForm(f => ({ ...f, sport_team_id: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option value="">No sport team</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.sport.charAt(0).toUpperCase() + t.sport.slice(1)} · {t.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-2">
            Add teams in <a href="/manager/teams" className="underline">Sport Teams</a>
          </p>
        </section>

        {/* Roles + skills */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Roles & Skill Levels</p>
          <div className="space-y-2">
            {ROLES.map(role => {
              const assigned = roles.find(r => r.role === role)
              return (
                <div key={role} className="flex items-center gap-3">
                  <input type="checkbox" checked={!!assigned} onChange={() => toggleRole(role)}
                    className="rounded" id={`role-${role}`} />
                  <label htmlFor={`role-${role}`} className="text-sm text-gray-700 w-44 shrink-0">
                    {ROLE_LABELS[role]}
                  </label>
                  {assigned && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setSkill(role, n)}
                          className={`w-7 h-7 text-xs rounded font-medium transition-colors ${
                            n <= assigned.skill_level
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <button onClick={save} disabled={saving}
          className="px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
