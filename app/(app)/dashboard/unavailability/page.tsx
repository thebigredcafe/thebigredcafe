'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UnavailRow {
  id: string
  date: string
  reason: string
}

export default function UnavailabilityPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<UnavailRow[]>([])
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('unavailability')
      .select('id, date, reason')
      .eq('user_id', user.id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date')
    if (data) setRows(data)
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!newDate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('unavailability').insert({
      user_id: user.id,
      date: newDate,
      reason: newReason || null,
      all_day: true,
    })
    setNewDate('')
    setNewReason('')
    setSaving(false)
    load()
  }

  async function remove(id: string) {
    await supabase.from('unavailability').delete().eq('id', id)
    setRows(r => r.filter(row => row.id !== id))
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Time Off</h1>
      <p className="text-sm text-gray-500 mb-6">
        Let the manager know about specific dates you can't work.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Add a date</p>
        <div className="flex gap-2">
          <input
            type="date"
            value={newDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setNewDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          <input
            type="text"
            value={newReason}
            onChange={e => setNewReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          <button
            onClick={add}
            disabled={!newDate || saving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(row => (
            <div key={row.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{formatDate(row.date)}</p>
                {row.reason && <p className="text-xs text-gray-500 mt-0.5">{row.reason}</p>}
              </div>
              <button
                onClick={() => remove(row.id)}
                className="text-gray-400 hover:text-red-500 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No upcoming time off logged.</p>
      )}
    </div>
  )
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
