'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface Preference {
  id: string
  text: string
  enabled: boolean
}

const STORAGE_KEY = 'cafePreferences_v1'

const DEFAULT_PREFS: Preference[] = [
  { id: '1', text: 'Use Juniors when available', enabled: true },
  { id: '2', text: 'Need a 4 star Kitchen Cook/Prep on till 2 daily', enabled: true },
  { id: '3', text: 'Save wages if possible', enabled: true },
]

function load(): Preference[] {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    return JSON.parse(raw)
  } catch { return DEFAULT_PREFS }
}

export default function PreferencesBuilder() {
  const [prefs, setPrefs] = useState<Preference[]>(load)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [dragging, setDragging] = useState<{ id: string; startY: number; currentIdx: number } | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs])

  function addPref() {
    const id = Date.now().toString()
    const newPref: Preference = { id, text: 'New preference', enabled: true }
    setPrefs(p => [...p, newPref])
    setEditingId(id)
    setEditText('New preference')
  }

  function deletePref(id: string) {
    setPrefs(p => p.filter(x => x.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function toggleEnabled(id: string) {
    setPrefs(p => p.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  }

  function startEdit(pref: Preference) {
    setEditingId(pref.id)
    setEditText(pref.text)
  }

  function saveEdit() {
    if (!editingId) return
    setPrefs(p => p.map(x => x.id === editingId ? { ...x, text: editText.trim() || x.text } : x))
    setEditingId(null)
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent, id: string, idx: number) => {
    e.preventDefault()
    setDragging({ id, startY: e.clientY, currentIdx: idx })
    setDragOverIdx(idx)

    const move = (ev: MouseEvent) => {
      if (!listRef.current) return
      const rows = listRef.current.querySelectorAll('[data-row]')
      let targetIdx = idx
      rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect()
        if (ev.clientY > rect.top + rect.height / 2) targetIdx = i + 1
      })
      setDragOverIdx(Math.min(targetIdx, rows.length - 1))
    }

    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)

      setDragging(null)
      setDragOverIdx(null)

      if (!listRef.current) return
      const rows = listRef.current.querySelectorAll('[data-row]')
      let targetIdx = idx
      rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect()
        if (ev.clientY > rect.top + rect.height / 2) targetIdx = i + 1
      })
      targetIdx = Math.min(targetIdx, rows.length - 1)

      if (targetIdx === idx) return
      setPrefs(prev => {
        const next = [...prev]
        const [item] = next.splice(idx, 1)
        const insertAt = targetIdx > idx ? targetIdx - 1 : targetIdx
        next.splice(insertAt, 0, item)
        return next
      })
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Roster Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          List your scheduling preferences in priority order. These are applied top-to-bottom when auto-filling the roster.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" ref={listRef}>
        {/* Table header */}
        <div className="grid grid-cols-[32px_32px_1fr_32px] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div></div>
          <div className="text-center">#</div>
          <div className="pl-2">Preference</div>
          <div></div>
        </div>

        {prefs.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            No preferences yet — add one below.
          </div>
        )}

        {prefs.map((pref, idx) => {
          const isDraggingThis = dragging?.id === pref.id
          const isDropTarget = dragOverIdx === idx && dragging?.id !== pref.id
          return (
            <div
              key={pref.id}
              data-row
              className={[
                'grid grid-cols-[32px_32px_1fr_32px] gap-0 px-4 py-3 items-center border-b border-gray-100 last:border-b-0 transition-colors',
                isDraggingThis ? 'opacity-40 bg-gray-50' : 'bg-white hover:bg-gray-50',
                isDropTarget ? 'border-t-2 border-t-indigo-400' : '',
              ].join(' ')}
            >
              {/* Drag handle */}
              <div
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none flex items-center justify-center"
                onMouseDown={e => onDragStart(e, pref.id, idx)}
                title="Drag to reorder"
              >
                ⠿
              </div>

              {/* Priority number */}
              <div className={`text-center text-sm font-semibold ${pref.enabled ? 'text-indigo-600' : 'text-gray-300'}`}>
                {pref.enabled ? idx + 1 : '–'}
              </div>

              {/* Text / edit field */}
              <div className="pl-2">
                {editingId === pref.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    className="w-full text-sm border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                ) : (
                  <span
                    className={`text-sm cursor-text ${pref.enabled ? 'text-gray-900' : 'text-gray-400 line-through'}`}
                    onDoubleClick={() => startEdit(pref)}
                    title="Double-click to edit"
                  >
                    {pref.text}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => toggleEnabled(pref.id)}
                  title={pref.enabled ? 'Disable' : 'Enable'}
                  className={`text-xs w-6 h-6 flex items-center justify-center rounded transition-colors ${pref.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                >
                  ✓
                </button>
                <button
                  onClick={() => deletePref(pref.id)}
                  title="Delete"
                  className="text-xs w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={addPref}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Add preference
        </button>
        <p className="text-xs text-gray-400">Double-click a preference to edit · Drag ⠿ to reorder</p>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs font-medium text-gray-600 mb-2">How preferences work</p>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• Preferences are applied in order (1 = highest priority) when using Auto-fill</li>
          <li>• Toggle ✓ to enable/disable a preference without deleting it</li>
          <li>• <span className="font-medium">Use Juniors when available</span> — scores school kids higher for all CS/floor shifts</li>
          <li>• <span className="font-medium">Need a 4 star Kitchen Cook/Prep on till 2 daily</span> — reserves a skill 4+ cook for the late kitchen slot</li>
          <li>• <span className="font-medium">Save wages if possible</span> — prefers lower hourly rate staff when skill levels are equal</li>
        </ul>
      </div>
    </div>
  )
}
