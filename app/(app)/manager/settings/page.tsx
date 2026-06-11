'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Settings {
  weekday_open: string
  weekday_close: string
  saturday_open: string
  saturday_close: string
  pre_game_buffer_mins: number
  post_game_buffer_mins: number
  netball_duration_mins: number
  soccer_duration_mins: number
  rugby_duration_mins: number
}

const DEFAULTS: Settings = {
  weekday_open: '06:00',
  weekday_close: '16:30',
  saturday_open: '07:00',
  saturday_close: '14:30',
  pre_game_buffer_mins: 60,
  post_game_buffer_mins: 45,
  netball_duration_mins: 60,
  soccer_duration_mins: 60,
  rugby_duration_mins: 80,
}

function to12h(time24: string) {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`
}

function to24h(time12: string) {
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return time12
  let h = parseInt(match[1])
  const m = match[2]
  const ampm = match[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m}`
}

export default function SettingsPage() {
  const supabase = createClient()
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('roster_settings').select('*').single().then(({ data }) => {
      if (data) setS({ ...DEFAULTS, ...data })
      setLoading(false)
    })
  }, [])

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    await supabase.from('roster_settings').upsert({ id: true, ...s })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Roster Settings</h1>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Weekday hours */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Weekday hours (Mon–Fri)</h2>
          <p className="text-xs text-gray-400 mt-0.5">The roster window for Monday to Friday.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Open</span>
            <input type="time" value={s.weekday_open} onChange={e => set('weekday_open', e.target.value)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Close</span>
            <input type="time" value={s.weekday_close} onChange={e => set('weekday_close', e.target.value)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      {/* Saturday hours */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Saturday hours</h2>
          <p className="text-xs text-gray-400 mt-0.5">The roster window for each Saturday. Game/event blocks and availability windows are clamped to this range.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Open</span>
            <input type="time" value={s.saturday_open} onChange={e => set('saturday_open', e.target.value)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Close</span>
            <input type="time" value={s.saturday_close} onChange={e => set('saturday_close', e.target.value)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      {/* Game buffers */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Game buffers</h2>
          <p className="text-xs text-gray-400 mt-0.5">Extra time added before and after a fixture to account for travel and warm-up.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Pre-game buffer (mins)</span>
            <input type="number" min={0} step={5} value={s.pre_game_buffer_mins}
              onChange={e => set('pre_game_buffer_mins', parseInt(e.target.value) || 0)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Post-game buffer (mins)</span>
            <input type="number" min={0} step={5} value={s.post_game_buffer_mins}
              onChange={e => set('post_game_buffer_mins', parseInt(e.target.value) || 0)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      {/* Sport play times */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Sport play times</h2>
          <p className="text-xs text-gray-400 mt-0.5">How long a typical game lasts for each sport, in minutes. Events with their own start/end times ignore these values.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Netball (mins)</span>
            <input type="number" min={1} step={5} value={s.netball_duration_mins}
              onChange={e => set('netball_duration_mins', parseInt(e.target.value) || 60)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Soccer (mins)</span>
            <input type="number" min={1} step={5} value={s.soccer_duration_mins}
              onChange={e => set('soccer_duration_mins', parseInt(e.target.value) || 60)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Rugby League (mins)</span>
            <input type="number" min={1} step={5} value={s.rugby_duration_mins}
              onChange={e => set('rugby_duration_mins', parseInt(e.target.value) || 80)}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
      </div>
    </div>
  )
}
