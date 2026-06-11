'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
type Day = typeof DAYS[number]

interface ChangeRow {
  id: string
  effective_from: string
  effective_to?: string
  day_of_week: Day
  start_time?: string
  end_time?: string
  unavailable: boolean
  note?: string
}

export default function ChangesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<ChangeRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    effective_from: '',
    effective_to: '',
    day_of_week: 'Mon' as Day,
    start_time: '09:00',
    end_time: '17:00',
    unavailable: false,
    note: '',
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('availability_changes')
      .select('*')
      .eq('user_id', user.id)
      .order('effective_from')
    if (data) setRows(data)
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!form.effective_from || !form.day_of_week) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('availability_changes').insert({
      user_id: user.id,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      day_of_week: form.day_of_week,
      start_time: form.unavailable ? null : form.start_time,
      end_time: form.unavailable ? null : form.end_time,
      unavailable: form.unavailable,
      note: form.note || null,
    })
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function remove(id: string) {
    await supabase.from('availability_changes').delete().eq('id', id)
    setRows(r => r.filter(row => row.id !== id))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Future Changes</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          + Add change
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Notify the manager of upcoming changes to your availability — e.g. new semester timetables.
      </p>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
          <p className="text-sm font-medium text-gray-700">New availability change</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From date</label>
              <input type="date" value={form.effective_from}
                onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Until date (optional)</label>
              <input type="date" value={form.effective_to}
                onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Day of week</label>
            <select value={form.day_of_week}
              onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value as Day }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2">
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="unavailable" checked={form.unavailable}
              onChange={e => setForm(f => ({ ...f, unavailable: e.target.checked }))}
              className="rounded" />
            <label htmlFor="unavailable" className="text-sm text-gray-700">
              Unavailable this day
            </label>
          </div>
          {!form.unavailable && (
            <div className="flex gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Available from</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Until</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note (e.g. "Semester 2 timetable")</label>
            <input type="text" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.effective_from}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(row => (
            <div key={row.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {row.day_of_week} — from {formatDate(row.effective_from)}
                    {row.effective_to && ` until ${formatDate(row.effective_to)}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {row.unavailable
                      ? 'Not available'
                      : `${row.start_time?.slice(0, 5)} – ${row.end_time?.slice(0, 5)}`}
                  </p>
                  {row.note && <p className="text-xs text-gray-400 mt-0.5">{row.note}</p>}
                </div>
                <button onClick={() => remove(row.id)}
                  className="text-gray-400 hover:text-red-500 text-sm ml-4">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No upcoming changes logged.</p>
      )}
    </div>
  )
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
