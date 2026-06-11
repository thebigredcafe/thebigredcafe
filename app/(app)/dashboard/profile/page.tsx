'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SportTeam { id: string; name: string; sport: string }

const SPORT_LABELS: Record<string, string> = {
  soccer: 'Soccer',
  rugby: 'Rugby League',
  netball: 'Netball',
}

export default function ProfilePage() {
  const supabase = createClient()
  const [teams, setTeams] = useState<SportTeam[]>([])
  const [sportTeamId, setSportTeamId] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, { data: sportTeams }] = await Promise.all([
        supabase.from('profiles').select('phone, sport_team_id').eq('id', user.id).single(),
        supabase.from('sport_teams').select('id, name, sport').order('sport').order('name'),
      ])

      if (profile) {
        setPhone(profile.phone ?? '')
        setSportTeamId(profile.sport_team_id ?? '')
      }
      if (sportTeams) setTeams(sportTeams)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      phone: phone || null,
      sport_team_id: sportTeamId || null,
    }).eq('id', user.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const grouped = teams.reduce<Record<string, SportTeam[]>>((acc, t) => {
    if (!acc[t.sport]) acc[t.sport] = []
    acc[t.sport].push(t)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">My Profile</h1>
      <p className="text-sm text-gray-500 mb-6">Update your contact details and sport team.</p>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Contact</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 0412 345 678"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Sport Team</p>
          <p className="text-xs text-gray-500">
            Selecting your team lets the manager see when you have games so they can roster around them.
          </p>
          <select
            value={sportTeamId}
            onChange={e => setSportTeamId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          >
            <option value="">I don't play sport / no team</option>
            {Object.entries(grouped).map(([sport, sportTeams]) => (
              <optgroup key={sport} label={SPORT_LABELS[sport] ?? sport}>
                {sportTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {teams.length === 0 && (
            <p className="text-xs text-gray-400">No teams have been added yet — ask your manager to add them.</p>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
