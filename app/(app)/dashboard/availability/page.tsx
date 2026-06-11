'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
type Day = typeof DAYS[number]

interface AvailRow {
  id?: string
  day_of_week: Day
  start_time: string
  end_time: string
  note: string
}

export default function AvailabilityPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<AvailRow[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', user.id)
        .order('day_of_week')
      if (data) setRows(data)
    }
    load()
  }, [])

  function addRow(day: Day) {
    setRows(r => [...r, { day_of_week: day, start_time: '09:00', end_time: '17:00', note: '' }])
  }

  function updateRow(idx: number, field: keyof AvailRow, value: string) {
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  function removeRow(idx: number) {
    setRows(r => r.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Delete existing and re-insert
    await supabase.from('availability').delete().eq('user_id', user.id)
    if (rows.length > 0) {
      await supabase.from('availability').insert(
        rows.map(r => ({
          user_id: user.id,
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
          note: r.note || null,
        }))
      )
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Weekly Availability</h1>
      <p className="text-sm text-gray-500 mb-6">
        Set the days and times you're generally available each week.
      </p>

      <div className="space-y-2 mb-6">
        {DAYS.map(day => {
          const dayRows = rows.map((r, i) => ({ ...r, idx: i })).filter(r => r.day_of_week === day)
          return (
            <div key={day} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 w-10">{day}</span>
                <button
                  onClick={() => addRow(day)}
                  className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-0.5"
                >
                  + Add
                </button>
              </div>
              {dayRows.length === 0 && (
                <p className="text-xs text-gray-400">Not available</p>
              )}
              {dayRows.map(row => (
                <div key={row.idx} className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={row.start_time}
                    onChange={e => updateRow(row.idx, 'start_time', e.target.value)}
                    className="text-sm border border-gray-200 rounded px-2 py-1 w-28"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="time"
                    value={row.end_time}
                    onChange={e => updateRow(row.idx, 'end_time', e.target.value)}
                    className="text-sm border border-gray-200 rounded px-2 py-1 w-28"
                  />
                  <input
                    type="text"
                    value={row.note}
                    onChange={e => updateRow(row.idx, 'note', e.target.value)}
                    placeholder="Note (optional)"
                    className="text-sm border border-gray-200 rounded px-2 py-1 flex-1 min-w-0"
                  />
                  <button
                    onClick={() => removeRow(row.idx)}
                    className="text-gray-400 hover:text-red-500 text-sm px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save availability'}
      </button>
    </div>
  )
}
