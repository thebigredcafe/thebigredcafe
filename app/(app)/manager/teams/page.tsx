'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Sport } from '@/lib/types'

interface Team {
  id: string
  sport: Sport
  name: string
  ssfa_club_id?: number
  ssfa_age_group_id?: number
  ssfa_label?: string
  prl_competition_id?: number
  prl_team_id?: number
  playhq_team_id?: string
}

const SPORT_LABELS: Record<Sport, string> = {
  soccer: 'Soccer (SSFA)',
  rugby: 'Rugby League (MySideline)',
  netball: 'Netball (PlayHQ)',
}

export default function TeamsPage() {
  const supabase = createClient()
  const [teams, setTeams] = useState<Team[]>([])
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState('')
  const [form, setForm] = useState({
    sport: 'soccer' as Sport,
    name: '',
    ssfa_club_id: '',
    ssfa_age_group_id: '',
    ssfa_label: '',
    prl_competition_id: '',
    prl_team_id: '',
    playhq_team_id: '',
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase.from('sport_teams').select('*').order('sport').order('name')
    if (data) setTeams(data)
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    const row: any = { sport: form.sport, name: form.name }
    if (form.sport === 'soccer') {
      row.ssfa_club_id = parseInt(form.ssfa_club_id)
      row.ssfa_age_group_id = parseInt(form.ssfa_age_group_id)
      row.ssfa_label = form.ssfa_label
    } else if (form.sport === 'rugby') {
      row.prl_competition_id = parseInt(form.prl_competition_id)
      row.prl_team_id = parseInt(form.prl_team_id)
    } else {
      row.playhq_team_id = form.playhq_team_id
    }
    await supabase.from('sport_teams').insert(row)
    setSaving(false)
    setShowForm(false)
    setForm({ sport: 'soccer', name: '', ssfa_club_id: '', ssfa_age_group_id: '', ssfa_label: '', prl_competition_id: '', prl_team_id: '', playhq_team_id: '' })
    load()
  }

  async function remove(id: string) {
    await supabase.from('sport_teams').delete().eq('id', id)
    setTeams(t => t.filter(x => x.id !== id))
  }

  async function refreshFixtures() {
    setRefreshing(true)
    setRefreshResult('')
    const res = await fetch('/api/fixtures/refresh', { method: 'POST' })
    const data = await res.json()
    const total = data.results?.reduce((sum: number, r: any) => sum + r.fetched, 0) ?? 0
    setRefreshResult(`Refreshed — ${total} fixtures fetched`)
    setRefreshing(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sport Teams</h1>
          <p className="text-sm text-gray-500 mt-0.5">Teams linked to staff sport fixtures</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refreshFixtures} disabled={refreshing}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {refreshing ? 'Refreshing…' : 'Refresh fixtures'}
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            + Add team
          </button>
        </div>
      </div>

      {refreshResult && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {refreshResult}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
          <p className="text-sm font-medium text-gray-700">Add sport team</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sport</label>
            <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value as Sport }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2">
              <option value="soccer">Soccer (SSFA)</option>
              <option value="rugby">Rugby League (MySideline)</option>
              <option value="netball">Netball (PlayHQ)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Team name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. LOFT W18B"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
          </div>

          {form.sport === 'soccer' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SSFA Club ID</label>
                  <input value={form.ssfa_club_id} onChange={e => setForm(f => ({ ...f, ssfa_club_id: e.target.value }))}
                    placeholder="e.g. 540"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SSFA Age Group ID</label>
                  <input value={form.ssfa_age_group_id} onChange={e => setForm(f => ({ ...f, ssfa_age_group_id: e.target.value }))}
                    placeholder="e.g. 592"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Team label (for matching fixtures)</label>
                <input value={form.ssfa_label} onChange={e => setForm(f => ({ ...f, ssfa_label: e.target.value }))}
                  placeholder="e.g. LOFT W18B"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <p className="text-xs text-gray-400 mt-1">
                  Find IDs in the SSFA URL: fixtures?club=<strong>540</strong>&age_group=<strong>592</strong>
                </p>
              </div>
            </>
          )}

          {form.sport === 'rugby' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Competition ID</label>
                <input value={form.prl_competition_id} onChange={e => setForm(f => ({ ...f, prl_competition_id: e.target.value }))}
                  placeholder="e.g. 65724930"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Team ID</label>
                <input value={form.prl_team_id} onChange={e => setForm(f => ({ ...f, prl_team_id: e.target.value }))}
                  placeholder="e.g. 67190525"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
              <p className="col-span-2 text-xs text-gray-400">
                Find IDs in the MySideline URL: /competitions/<strong>65724930</strong>?filter=teams&team=<strong>67190525</strong>
              </p>
            </div>
          )}

          {form.sport === 'netball' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">PlayHQ Team ID</label>
              <input value={form.playhq_team_id} onChange={e => setForm(f => ({ ...f, playhq_team_id: e.target.value }))}
                placeholder="e.g. 8e08606d"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <p className="text-xs text-gray-400 mt-1">
                Find the team ID at the end of the PlayHQ URL for the team page.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add team'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {teams.map(team => (
          <div key={team.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{team.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{SPORT_LABELS[team.sport]}</p>
              {team.sport === 'soccer' && (
                <p className="text-xs text-gray-400">club={team.ssfa_club_id} · age_group={team.ssfa_age_group_id}</p>
              )}
              {team.sport === 'rugby' && (
                <p className="text-xs text-gray-400">comp={team.prl_competition_id} · team={team.prl_team_id}</p>
              )}
              {team.sport === 'netball' && (
                <p className="text-xs text-gray-400">teamId={team.playhq_team_id}</p>
              )}
            </div>
            <button onClick={() => remove(team.id)}
              className="text-gray-400 hover:text-red-500 text-sm">
              Remove
            </button>
          </div>
        ))}
        {teams.length === 0 && (
          <p className="text-sm text-gray-400">No sport teams added yet.</p>
        )}
      </div>
    </div>
  )
}
