'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Timeline: 5:00am – 6:00pm ───────────────────────────────────────────────
const T_START = 5 * 60   // 300  (5am in minutes from midnight)
const T_END   = 18 * 60  // 1080 (6pm)
const T_RANGE = T_END - T_START // 780 minutes shown

const SNAP = 15 // snap to 15-minute increments
const MIN_DURATION = 30

const ROLE_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  barista:           { bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-900',    label: 'Barista' },
  customer_service:  { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-900', label: 'CS / Floor' },
  kitchen_cook:      { bg: 'bg-blue-200',   border: 'border-blue-400',   text: 'text-blue-900',   label: 'Kitchen' },
  kitchen_cook_prep: { bg: 'bg-blue-200',   border: 'border-blue-400',   text: 'text-blue-900',   label: 'Kitchen Prep' },
  dishwasher:        { bg: 'bg-sky-100',    border: 'border-sky-300',    text: 'text-sky-900',    label: 'Dishwasher' },
  cs_dish:           { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-900', label: 'CS + Dish' },
}
const ROLE_OPTIONS = Object.entries(ROLE_STYLE).map(([v, s]) => ({ value: v, ...s }))
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const STORAGE_KEY = 'cafeRequirements_v1' // kept as local cache fallback

// ── Types ────────────────────────────────────────────────────────────────────
type Slot = { id: string; role: string; startMin: number; endMin: number; label?: string }
type Reqs  = Record<string, Slot[]>   // day -> slots

type DragState = {
  type: 'move' | 'left' | 'right'
  day: string; id: string
  pointerXStart: number
  slotStartStart: number; slotEndStart: number
  pxPerMin: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const snapM  = (m: number) => Math.round(m / SNAP) * SNAP
const clamp  = (m: number) => Math.max(T_START, Math.min(T_END, m))
const uid    = () => Math.random().toString(36).slice(2, 9)
const fmtMin = (m: number) => {
  const h = Math.floor(m / 60), mn = m % 60
  const ap = h >= 12 ? 'pm' : 'am'
  return mn === 0 ? `${h % 12 || 12}${ap}` : `${h % 12 || 12}:${String(mn).padStart(2, '0')}${ap}`
}
const minToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ── Hour tick marks ──────────────────────────────────────────────────────────
const TICKS = Array.from({ length: 14 }, (_, i) => T_START + i * 60).filter(m => m <= T_END)

// ── Load / save ──────────────────────────────────────────────────────────────
function loadLocalReqs(): Reqs {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}
function saveLocalReqs(r: Reqs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)) } catch {}
}

async function loadDbReqs(): Promise<Reqs> {
  try {
    const res = await fetch('/api/requirements')
    if (!res.ok) return {}
    const rows: { day_of_week: string; role: string; start_min: number; end_min: number; label?: string; id: string }[] = await res.json()
    const reqs: Reqs = {}
    for (const r of rows) {
      if (!reqs[r.day_of_week]) reqs[r.day_of_week] = []
      reqs[r.day_of_week].push({ id: r.id, role: r.role, startMin: r.start_min, endMin: r.end_min, label: r.label })
    }
    return reqs
  } catch { return {} }
}

async function saveDbReqs(r: Reqs) {
  const rows = Object.entries(r).flatMap(([day, slots]) =>
    (slots ?? []).map(s => ({ day_of_week: day, role: s.role, start_min: s.startMin, end_min: s.endMin, label: s.label ?? null }))
  )
  await fetch('/api/requirements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) })
}

// Export for roster auto-fill (reads localStorage cache, which is kept in sync)
export function getStoredRequirements(): Reqs { return loadLocalReqs() }
export function reqToShiftTime(slot: Slot): { start_time: string; end_time: string } {
  return { start_time: minToTime(slot.startMin), end_time: minToTime(slot.endMin) }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function RequirementsBuilder() {
  const [reqs, setReqs]     = useState<Reqs>({})
  const [day,  setDay]      = useState<string>('Mon')
  const [drag, setDrag]       = useState<DragState | null>(null)
  const [adding, setAdding]   = useState(false)
  const [addForm, setAddForm] = useState({ role: 'barista', start: '05:45', end: '11:00', label: '' })
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timelineRef           = useRef<HTMLDivElement>(null)

  // Load from DB on mount, fall back to localStorage while loading
  useEffect(() => {
    const local = loadLocalReqs()
    if (Object.keys(local).length) setReqs(local)
    loadDbReqs().then(db => {
      if (Object.keys(db).length) {
        setReqs(db)
        saveLocalReqs(db)
      }
    })
  }, [])

  // Debounced save to DB whenever reqs change (1.5s after last change)
  useEffect(() => {
    if (!Object.keys(reqs).length) return
    saveLocalReqs(reqs)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await saveDbReqs(reqs)
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 1500)
  }, [reqs])

  const daySlots = (reqs[day] ?? []).slice().sort((a, b) => a.startMin - b.startMin)

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const pxPerMin = useCallback(() => {
    return (timelineRef.current?.getBoundingClientRect().width ?? 780) / T_RANGE
  }, [])

  const onBarMouseDown = useCallback((
    e: React.MouseEvent, id: string, type: DragState['type'],
    startMin: number, endMin: number
  ) => {
    e.preventDefault()
    setDrag({ type, day, id, pointerXStart: e.clientX, slotStartStart: startMin, slotEndStart: endMin, pxPerMin: pxPerMin() })
  }, [day, pxPerMin])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.pointerXStart
      const dm = snapM(dx / drag.pxPerMin)
      setReqs(prev => {
        const slots = (prev[drag.day] ?? []).map(s => {
          if (s.id !== drag.id) return s
          if (drag.type === 'move') {
            const dur = s.endMin - s.startMin
            const newStart = clamp(snapM(drag.slotStartStart + dm))
            const newEnd   = clamp(newStart + dur)
            return { ...s, startMin: newEnd - dur === newStart ? newStart : s.startMin, endMin: newEnd - dur === newStart ? newEnd : s.endMin }
          }
          if (drag.type === 'left') {
            const newStart = clamp(snapM(drag.slotStartStart + dm))
            if (drag.slotEndStart - newStart < MIN_DURATION) return s
            return { ...s, startMin: newStart }
          }
          // right
          const newEnd = clamp(snapM(drag.slotEndStart + dm))
          if (newEnd - drag.slotStartStart < MIN_DURATION) return s
          return { ...s, endMin: newEnd }
        })
        return { ...prev, [drag.day]: slots }
      })
    }
    const onUp = () => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag])

  // ── Add slot ───────────────────────────────────────────────────────────────
  function addSlot() {
    const startMin = parseInt(addForm.start.split(':')[0]) * 60 + parseInt(addForm.start.split(':')[1])
    const endMin   = parseInt(addForm.end.split(':')[0])   * 60 + parseInt(addForm.end.split(':')[1])
    if (endMin <= startMin) return
    const slot: Slot = { id: uid(), role: addForm.role, startMin, endMin, label: addForm.label || undefined }
    setReqs(prev => ({ ...prev, [day]: [...(prev[day] ?? []), slot] }))
    setAdding(false)
  }

  function removeSlot(id: string) {
    setReqs(prev => ({ ...prev, [day]: (prev[day] ?? []).filter(s => s.id !== id) }))
  }

  function copyDay(fromDay: string) {
    const from = reqs[fromDay]
    if (!from?.length) return
    setReqs(prev => ({ ...prev, [day]: from.map(s => ({ ...s, id: uid() })) }))
  }

  function copyToNext() {
    const idx = DAYS.indexOf(day as any)
    if (idx < 0 || idx >= DAYS.length - 1) return
    const slots = reqs[day] ?? []
    if (!slots.length) return
    const nextDay = DAYS[idx + 1]
    setReqs(prev => ({ ...prev, [nextDay]: slots.map(s => ({ ...s, id: uid() })) }))
    setDay(nextDay)
  }

  function copyToAllRemaining() {
    const idx = DAYS.indexOf(day as any)
    if (idx < 0 || idx >= DAYS.length - 1) return
    const slots = reqs[day] ?? []
    if (!slots.length) return
    setReqs(prev => {
      const next = { ...prev }
      for (let i = idx + 1; i < DAYS.length; i++) {
        next[DAYS[i]] = slots.map(s => ({ ...s, id: uid() }))
      }
      return next
    })
  }

  function clearDay() {
    setReqs(prev => ({ ...prev, [day]: [] }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Daily Requirements</h1>
          <p className="text-sm text-gray-500 mt-0.5">Set the shifts you need filled each day. The roster auto-fill will match staff to these.</p>
        </div>
        <div className="text-xs text-gray-400">
          {saving ? 'Saving…' : saved ? '✓ Saved' : ''}
        </div>
      </div>

      {/* Day tabs with slot-count indicators */}
      <div className="flex gap-1 mb-4">
        {DAYS.map(d => {
          const count = reqs[d]?.length ?? 0
          return (
            <button key={d} onClick={() => setDay(d)}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                day === d ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {d}
              {count > 0 && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  day === d ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setAdding(true)}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
          + Add shift slot
        </button>

        {/* Copy actions — only show when current day has slots */}
        {daySlots.length > 0 && DAYS.indexOf(day as any) < DAYS.length - 1 && (
          <>
            <button onClick={copyToNext}
              className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1">
              Copy to {DAYS[DAYS.indexOf(day as any) + 1]} →
            </button>
            <button onClick={copyToAllRemaining}
              className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg text-gray-600 hover:bg-gray-50">
              Copy to all remaining days
            </button>
          </>
        )}

        {/* Copy from another day */}
        {DAYS.filter(d => d !== day && (reqs[d]?.length ?? 0) > 0).length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Copy from:</span>
            {DAYS.filter(d => d !== day && (reqs[d]?.length ?? 0) > 0).map(d => (
              <button key={d} onClick={() => copyDay(d)}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                {d}
              </button>
            ))}
          </div>
        )}

        {daySlots.length > 0 && (
          <button onClick={clearDay}
            className="ml-auto text-xs text-red-400 hover:text-red-600 hover:underline">
            Clear {day}
          </button>
        )}
      </div>

      {/* Add slot form */}
      {adding && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-wrap gap-3 items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Role</span>
            <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
              className="block border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Start</span>
            <input type="time" value={addForm.start} onChange={e => setAddForm(f => ({ ...f, start: e.target.value }))}
              className="block border border-gray-200 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">End</span>
            <input type="time" value={addForm.end} onChange={e => setAddForm(f => ({ ...f, end: e.target.value }))}
              className="block border border-gray-200 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Label (optional)</span>
            <input type="text" placeholder="e.g. opener" value={addForm.label}
              onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
              className="block border border-gray-200 rounded px-2 py-1.5 text-sm w-32" />
          </label>
          <button onClick={addSlot} className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Add</button>
          <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden select-none">
        {/* Hour ticks header */}
        <div className="relative h-7 border-b border-gray-100 ml-28" ref={timelineRef}>
          {TICKS.map(m => (
            <div key={m} className="absolute top-0 flex flex-col items-center"
              style={{ left: `${((m - T_START) / T_RANGE) * 100}%` }}>
              <div className="h-full w-px bg-gray-200" />
              <span className="absolute top-1 text-[9px] text-gray-400 -translate-x-1/2 whitespace-nowrap">{fmtMin(m)}</span>
            </div>
          ))}
        </div>

        {daySlots.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No shifts set for {day} — click <strong>+ Add shift slot</strong> to start
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {daySlots.map(slot => {
              const style = ROLE_STYLE[slot.role] ?? ROLE_STYLE.customer_service
              const leftPct  = ((slot.startMin - T_START) / T_RANGE) * 100
              const widthPct = ((slot.endMin - slot.startMin) / T_RANGE) * 100

              return (
                <div key={slot.id} className="flex items-center h-12 group">
                  {/* Role label */}
                  <div className="w-28 shrink-0 px-3 text-xs font-medium text-gray-600">{style.label}</div>
                  {/* Bar area */}
                  <div className="relative flex-1 h-full">
                    {/* Background grid lines */}
                    {TICKS.map(m => (
                      <div key={m} className="absolute top-0 bottom-0 w-px bg-gray-100"
                        style={{ left: `${((m - T_START) / T_RANGE) * 100}%` }} />
                    ))}
                    {/* The draggable bar */}
                    <div
                      className={`absolute top-2 bottom-2 rounded border-2 ${style.bg} ${style.border} flex items-center cursor-grab active:cursor-grabbing shadow-sm`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onMouseDown={e => onBarMouseDown(e, slot.id, 'move', slot.startMin, slot.endMin)}
                    >
                      {/* Left resize handle */}
                      <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-10"
                        onMouseDown={e => { e.stopPropagation(); onBarMouseDown(e, slot.id, 'left', slot.startMin, slot.endMin) }} />
                      {/* Label */}
                      <span className={`flex-1 text-center text-[10px] font-semibold ${style.text} pointer-events-none truncate px-3`}>
                        {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}{slot.label ? ` · ${slot.label}` : ''}
                      </span>
                      {/* Right resize handle */}
                      <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-10"
                        onMouseDown={e => { e.stopPropagation(); onBarMouseDown(e, slot.id, 'right', slot.startMin, slot.endMin) }} />
                    </div>
                  </div>
                  {/* Delete */}
                  <button onClick={() => removeSlot(slot.id)}
                    className="w-8 shrink-0 text-gray-300 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      {daySlots.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {daySlots.map(slot => {
            const style = ROLE_STYLE[slot.role] ?? ROLE_STYLE.customer_service
            return (
              <span key={slot.id} className={`text-xs px-2 py-1 rounded border ${style.bg} ${style.border} ${style.text}`}>
                {style.label}: {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}{slot.label ? ` (${slot.label})` : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* Saved indicator */}
      <p className="mt-4 text-xs text-gray-400">Changes save automatically. Use the <strong>Roster Builder</strong> → <strong>Auto-fill</strong> to apply these to a week.</p>
    </div>
  )
}
