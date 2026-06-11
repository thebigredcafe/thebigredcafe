'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string
  full_name: string
  hourly_rate?: number
  saturday_rate?: number
  is_school_student?: boolean
  sport_team_id?: string
  sport_teams?: { name: string; sport: string } | null
}

interface StaffRole { user_id: string; role: Role; skill_level: number }

interface ShiftData {
  start_time: string
  end_time: string
  role: string
  split_time?: string
  split_role?: string
  notes?: string
}

interface Template {
  user_id: string
  day_of_week: string
  start_time: string
  end_time: string
  role: string
  split_time?: string
  split_role?: string
  notes?: string
}

interface Fixture { team_id: string; date: string; kickoff?: string }

interface DBShift {
  user_id: string; date: string; start_time: string; end_time: string
  role: string; split_time?: string; split_role?: string; notes?: string; published?: boolean
}

interface Props {
  staff: StaffMember[]
  staffRoles: StaffRole[]
  templates: Template[]
  fixtures: Fixture[]
  initialShifts: DBShift[]
  unavailability: { user_id: string; date: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const ROLE_COLOR: Record<string, { bg: string; border: string; text: string; label: string }> = {
  barista:           { bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-900',    label: 'Barista' },
  customer_service:  { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-900', label: 'CS/Floor' },
  floor_staff:       { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-900', label: 'CS/Floor' },
  kitchen_cook:      { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-900',   label: 'Kitchen' },
  kitchen_cook_prep: { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-900',   label: 'Kitchen' },
  dishwasher:        { bg: 'bg-sky-100',    border: 'border-sky-300',    text: 'text-sky-900',    label: 'Dishes' },
  new_staff:         { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-900',  label: 'New staff' },
  split:             { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-900', label: 'Split' },
}

const ROLE_OPTIONS = [
  { value: 'barista',          label: 'Barista'  },
  { value: 'customer_service', label: 'CS/Floor' },
  { value: 'kitchen_cook',     label: 'Kitchen'  },
  { value: 'dishwasher',       label: 'Dishes'   },
  { value: 'new_staff',        label: 'New staff'},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function toDateStr(d: Date): string { return d.toISOString().split('T')[0] }

function fmt(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  return (m === 0) ? `${h % 12 || 12}${ap}` : `${h % 12 || 12}:${String(m).padStart(2,'0')}${ap}`
}

function calcHours(s: string, e: string): number {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

function autoRole(roles: StaffRole[]): string {
  if (!roles.length) return 'customer_service'
  const priority: Role[] = ['barista', 'kitchen_cook', 'kitchen_cook_prep', 'customer_service', 'floor_staff', 'dishwasher']
  const best = [...roles].sort((a, b) => b.skill_level - a.skill_level)[0]
  const topRoles = roles.filter(r => r.skill_level === best.skill_level)
  for (const p of priority) if (topRoles.find(r => r.role === p)) return p
  return best.role
}

// ─── RosterGrid ───────────────────────────────────────────────────────────────

function dbShiftsToMap(data: DBShift[]): Record<string, ShiftData> {
  const map: Record<string, ShiftData> = {}
  for (const s of data) {
    map[`${s.user_id}_${s.date}`] = {
      start_time: s.start_time, end_time: s.end_time, role: s.role ?? '',
      split_time: s.split_time ?? undefined, split_role: s.split_role ?? undefined, notes: s.notes ?? undefined,
    }
  }
  return map
}

export default function RosterGrid({ staff, staffRoles, templates, fixtures, initialShifts, unavailability }: Props) {
  const supabase = createClient()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [shifts, setShifts] = useState<Record<string, ShiftData>>(() => dbShiftsToMap(initialShifts))
  const [published, setPublished] = useState(() => initialShifts.some(s => s.published))
  const [hasRoster, setHasRoster] = useState(() => initialShifts.length > 0)
  const [unavailSet, setUnavailSet] = useState<Set<string>>(() => new Set(unavailability.map(u => `${u.user_id}_${u.date}`)))
  const [editKey, setEditKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingTmpl, setSavingTmpl] = useState(false)
  const [savedTmpl, setSavedTmpl] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart])

  const rolesByUser = useMemo(() =>
    staffRoles.reduce<Record<string, StaffRole[]>>((acc, r) => {
      if (!acc[r.user_id]) acc[r.user_id] = []
      acc[r.user_id].push(r)
      return acc
    }, {}), [staffRoles])

  // Skip initial load for the current week (already loaded server-side)
  const isFirstLoad = useState(true)
  useEffect(() => {
    if (isFirstLoad[0]) { isFirstLoad[1](false); return }
    const start = toDateStr(weekStart)
    const end = toDateStr(addDays(weekStart, 5))
    Promise.all([
      supabase.from('roster_shifts').select('*').gte('date', start).lte('date', end),
      supabase.from('unavailability').select('user_id, date').gte('date', start).lte('date', end),
    ]).then(([{ data }, { data: unavail }]) => {
      if (!data || data.length === 0) { setShifts({}); setHasRoster(false); setPublished(false); setEditKey(null) }
      else {
        setShifts(dbShiftsToMap(data))
        setHasRoster(true)
        setPublished(data.some((s: any) => s.published))
        setEditKey(null)
      }
      setUnavailSet(new Set((unavail ?? []).map((u: any) => `${u.user_id}_${u.date}`)))
    })
  }, [weekStart])

  function createRoster() {
    const next: Record<string, ShiftData> = {}
    for (const m of staff) {
      for (let i = 0; i < 6; i++) {
        const dateStr = toDateStr(weekDates[i])
        const key = `${m.id}_${dateStr}`
        if (unavailSet.has(key)) continue  // skip unavailable staff
        const t = templates.find(t => t.user_id === m.id && t.day_of_week === DAYS[i])
        if (t?.start_time) {
          next[key] = {
            start_time: t.start_time, end_time: t.end_time,
            role: t.role ?? autoRole(rolesByUser[m.id] ?? []),
            split_time: t.split_time ?? undefined, split_role: t.split_role ?? undefined, notes: t.notes ?? undefined,
          }
        }
      }
    }
    setShifts(next)
    setHasRoster(true)
    setPublished(false)
  }

  async function saveRoster() {
    setSaving(true)
    const rows = Object.entries(shifts).map(([key, d]) => {
      const idx = key.indexOf('_')
      const uid = key.slice(0, idx), date = key.slice(idx + 1)
      return { user_id: uid, date, start_time: d.start_time, end_time: d.end_time, role: d.role,
        split_time: d.split_time ?? null, split_role: d.split_role ?? null, notes: d.notes ?? null, published }
    })
    if (rows.length > 0) await supabase.from('roster_shifts').upsert(rows, { onConflict: 'user_id,date' })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  async function publishRoster() {
    setPublishing(true)
    // Save first, then mark all as published
    const rows = Object.entries(shifts).map(([key, d]) => {
      const idx = key.indexOf('_')
      const uid = key.slice(0, idx), date = key.slice(idx + 1)
      return { user_id: uid, date, start_time: d.start_time, end_time: d.end_time, role: d.role,
        split_time: d.split_time ?? null, split_role: d.split_role ?? null, notes: d.notes ?? null, published: true }
    })
    if (rows.length > 0) await supabase.from('roster_shifts').upsert(rows, { onConflict: 'user_id,date' })
    setPublished(true)
    setPublishing(false)
  }

  async function unpublishRoster() {
    const start = toDateStr(weekStart)
    const end = toDateStr(addDays(weekStart, 5))
    await supabase.from('roster_shifts').update({ published: false }).gte('date', start).lte('date', end)
    setPublished(false)
  }

  async function saveAsTemplate() {
    setSavingTmpl(true)
    await supabase.from('shift_templates').delete().in('user_id', staff.map(s => s.id))
    const rows = []
    for (const m of staff) {
      for (let i = 0; i < 6; i++) {
        const s = shifts[`${m.id}_${toDateStr(weekDates[i])}`]
        if (s?.start_time) rows.push({
          user_id: m.id, day_of_week: DAYS[i],
          start_time: s.start_time, end_time: s.end_time, role: s.role,
          split_time: s.split_time ?? null, split_role: s.split_role ?? null, notes: s.notes ?? null,
        })
      }
    }
    if (rows.length > 0) await supabase.from('shift_templates').insert(rows)
    setSavingTmpl(false); setSavedTmpl(true); setTimeout(() => setSavedTmpl(false), 2500)
  }

  function setShift(userId: string, date: string, data: ShiftData | null) {
    const key = `${userId}_${date}`
    setShifts(prev => {
      if (!data) { const n = { ...prev }; delete n[key]; return n }
      return { ...prev, [key]: data }
    })
  }

  const dailyTotals = useMemo(() => weekDates.map(date => {
    const ds = toDateStr(date)
    return staff.reduce((s, m) => { const sh = shifts[`${m.id}_${ds}`]; return s + (sh ? calcHours(sh.start_time, sh.end_time) : 0) }, 0)
  }), [weekDates, staff, shifts])

  // Coverage check per day
  const dailyCoverage = useMemo(() => weekDates.map((date, di) => {
    const ds = toDateStr(date)
    const isSat = di === 5
    const dayShifts = staff.map(m => ({ member: m, shift: shifts[`${m.id}_${ds}`] ?? null })).filter(x => x.shift)

    const baristas   = dayShifts.filter(x => x.shift!.role === 'barista' || x.shift!.split_time)
    const kitchen    = dayShifts.filter(x => x.shift!.role === 'kitchen_cook' || x.shift!.role === 'kitchen_cook_prep')
    const cs         = dayShifts.filter(x => x.shift!.role === 'customer_service' || x.shift!.role === 'floor_staff')
    const dishes     = dayShifts.filter(x => x.shift!.role === 'dishwasher' || x.shift!.split_time)

    const kitOpener  = kitchen.some(x => x.shift!.start_time <= '06:30:00')
    const kitCloser  = kitchen.some(x => x.shift!.end_time >= '14:00:00')

    const needBar  = isSat ? 2 : 2
    const needKit  = isSat ? 2 : 1
    const needCS   = 1

    return {
      bar:  { ok: baristas.length >= needBar,  count: baristas.length,  need: needBar },
      kit:  { ok: kitchen.length >= needKit && kitOpener && kitCloser, count: kitchen.length, need: needKit, opener: kitOpener, closer: kitCloser },
      cs:   { ok: cs.length >= needCS,         count: cs.length,        need: needCS },
      dish: { count: dishes.length },
    }
  }), [weekDates, staff, shifts])

  const staffTotals = new Map(staff.map(m => [
    m.id,
    weekDates.reduce((s, d) => { const sh = shifts[`${m.id}_${toDateStr(d)}`]; return s + (sh ? calcHours(sh.start_time, sh.end_time) : 0) }, 0)
  ]))

  const weekLabel = `${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 5).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

  function hasFixture(staffId: string, dateStr: string) {
    const m = staff.find(s => s.id === staffId)
    if (!m?.sport_team_id) return false
    return fixtures.some(f => f.team_id === m.sport_team_id && f.date === dateStr)
  }

  const MANAGER_ID = '37f077a6-bc96-4599-b09e-314afdf0cfb0'

  // New staff placeholders — green section below FOH
  const NEW_STAFF_IDS = [
    'c029f573-99fb-48ef-be18-d94166e28ff9', // Meagan
    '1ef94d56-d1aa-4589-b0b2-01a8280128af', // Caitlin
  ]

  // Senior school kids — yellow, listed above junior school
  const SENIOR_SCHOOL_IDS = [
    '3e2ffb1c-19a3-441d-bada-0ec4755d0749', // Ileana
    '68af9f7b-4af5-42b4-87d2-b77113d4ccbd', // Kellarney
    'a4f1273b-70f4-4bc3-80ab-ffd38eb8c5f9', // Eden
    '2cad2f73-187a-4a6b-bf79-d428312af8e7', // Molly
  ]

  const GROUP_ORDER = ['manager', 'foh', 'new_staff', 'kitchen', 'school_senior', 'school_junior']
  const GROUP_META: Record<string, { label: string; rowBg: string; nameBg: string; headerBg: string; text: string; cellEmpty: string }> = {
    manager:      { label: 'Manager',           rowBg: 'bg-gray-100',    nameBg: 'bg-gray-100',   headerBg: 'bg-gray-200',    text: 'text-gray-700',   cellEmpty: 'bg-gray-100 border-gray-300 border-dashed' },
    foh:          { label: 'FOH',               rowBg: 'bg-white',       nameBg: 'bg-white',      headerBg: 'bg-slate-100',   text: 'text-slate-700',  cellEmpty: 'bg-slate-50 border-slate-200 border-dashed' },
    new_staff:    { label: 'New Staff',         rowBg: 'bg-green-50',    nameBg: 'bg-green-50',   headerBg: 'bg-green-100',   text: 'text-green-700',  cellEmpty: 'bg-green-50 border-green-200 border-dashed' },
    kitchen:      { label: 'Kitchen',           rowBg: 'bg-blue-50',     nameBg: 'bg-blue-50',    headerBg: 'bg-blue-100',    text: 'text-blue-700',   cellEmpty: 'bg-blue-50 border-blue-200 border-dashed' },
    school_senior:{ label: 'School — Senior',   rowBg: 'bg-yellow-50',   nameBg: 'bg-yellow-50',  headerBg: 'bg-yellow-100',  text: 'text-yellow-700', cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    school_junior:{ label: 'School — Junior',   rowBg: 'bg-green-50',    nameBg: 'bg-green-50',   headerBg: 'bg-green-100',   text: 'text-green-700',  cellEmpty: 'bg-green-50 border-green-200 border-dashed' },
  }

  function staffGroup(member: StaffMember): string {
    if (member.id === MANAGER_ID) return 'manager'
    if (NEW_STAFF_IDS.includes(member.id)) return 'new_staff'
    if (SENIOR_SCHOOL_IDS.includes(member.id)) return 'school_senior'
    if ((member as any).is_school_student) return 'school_junior'
    const roles = rolesByUser[member.id] ?? []
    const primary = autoRole(roles)
    if (primary === 'kitchen_cook' || primary === 'kitchen_cook_prep') return 'kitchen'
    return 'foh'
  }

  const groupedStaff = useMemo(() => {
    const groups: Record<string, StaffMember[]> = { manager: [], foh: [], new_staff: [], kitchen: [], school_senior: [], school_junior: [] }
    for (const m of staff) {
      const g = staffGroup(m)
      groups[g].push(m)
    }
    return groups
  }, [staff, rolesByUser])

  const sortedStaff = useMemo(() =>
    GROUP_ORDER.flatMap(g => groupedStaff[g].map(m => ({ member: m, group: g }))),
    [groupedStaff]
  )

  return (
    <div className="p-4">
      {/* Overlay to close editor */}
      {editKey && <div className="fixed inset-0 z-40" onClick={() => setEditKey(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">←</button>
          <span className="text-sm font-semibold text-gray-900 min-w-[210px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">→</button>
          <button onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Today</button>
          {published && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
              ✓ Published
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!hasRoster ? (
            <button onClick={createRoster}
              className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 font-medium">
              Create roster
            </button>
          ) : (
            <>
              <button onClick={saveAsTemplate} disabled={savingTmpl}
                className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {savedTmpl ? '✓ Template saved' : savingTmpl ? 'Saving…' : 'Save as template'}
              </button>
              <button onClick={saveRoster} disabled={saving}
                className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
              </button>
              {published ? (
                <button onClick={unpublishRoster}
                  className="px-4 py-1.5 border border-green-300 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100">
                  Unpublish
                </button>
              ) : (
                <button onClick={publishRoster} disabled={publishing}
                  className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 font-medium">
                  {publishing ? 'Publishing…' : 'Publish roster'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(ROLE_COLOR).map(([r, c]) => (
          <span key={r} className={`text-[11px] px-2 py-0.5 rounded border ${c.bg} ${c.border} ${c.text}`}>{c.label}</span>
        ))}
        <span className="text-[11px] px-2 py-0.5 rounded border bg-red-50 border-red-300 border-dashed text-red-500">Unavailable</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[120px]">Name</th>
              {weekDates.map((date, i) => (
                <th key={i} className="text-center px-2 py-2 font-medium text-gray-500 min-w-[120px]">
                  <div className="font-semibold">{DAYS[i]}</div>
                  <div className="text-gray-400 font-normal text-[10px]">
                    {date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </div>
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium text-gray-500 min-w-[50px]">Hrs</th>
            </tr>
          </thead>
          <tbody>
            {sortedStaff.map(({ member, group }, mi) => {
              const roles = rolesByUser[member.id] ?? []
              const isSchool = !!(member as any).is_school_student
              const meta = GROUP_META[group]
              const prevGroup = mi > 0 ? sortedStaff[mi - 1]?.group : null
              const isFirstInGroup = group !== prevGroup
              const total = staffTotals.get(member.id) ?? 0

              return [
                // Group header row
                isFirstInGroup && (
                  <tr key={`header-${group}`} className={`${meta.headerBg} border-y border-gray-200`}>
                    <td colSpan={8} className={`px-3 py-1.5 sticky left-0 ${meta.headerBg} text-[11px] font-semibold uppercase tracking-wide ${meta.text}`}>
                      {meta.label}
                    </td>
                  </tr>
                ),
                // Staff row
                <tr key={member.id} className={`${meta.rowBg} border-b border-gray-100`}>
                  <td className={`px-3 py-1 sticky left-0 z-10 ${meta.nameBg}`}>
                    <div className="font-medium text-gray-900">{member.full_name.split(' ')[0]}</div>
                    {isSchool && <div className="text-[10px] text-gray-400">school</div>}
                  </td>
                  {weekDates.map((date, di) => {
                    const dateStr = toDateStr(date)
                    const key = `${member.id}_${dateStr}`
                    const shift = shifts[key] ?? null
                    const isUnavail = unavailSet.has(key)
                    return (
                      <td key={di} className="px-1 py-1 relative">
                        <div className="relative">
                          <ShiftCell
                            shiftKey={key}
                            shift={shift}
                            isEditing={editKey === key}
                            hasFixture={hasFixture(member.id, dateStr)}
                            isSaturday={di === 5}
                            isSchool={isSchool}
                            suggestedRole={autoRole(roles)}
                            emptyClass={meta.cellEmpty}
                            isOpen={editKey === key}
                            onOpen={() => setEditKey(k => k === key ? null : key)}
                            onChange={(data) => { setShift(member.id, dateStr, data); setEditKey(null) }}
                          />
                          {isUnavail && (
                            <div className="absolute inset-0 rounded pointer-events-none bg-red-400/20 border border-red-300 border-dashed" title="Unavailable this day" />
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1 text-center text-gray-600 font-semibold">
                    {total > 0 ? total.toFixed(2) : ''}
                  </td>
                </tr>
              ].filter(Boolean)
            })}
          </tbody>
          <tfoot>
            {/* Coverage summary row */}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="px-3 py-2 sticky left-0 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cover</td>
              {dailyCoverage.map((cov, i) => (
                <td key={i} className="px-1 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cov.bar.ok ? 'bg-red-100 text-red-700' : 'bg-red-200 text-red-800 font-bold'}`}>
                      Bar {cov.bar.count}/{cov.bar.need}{!cov.bar.ok ? ' ✗' : ''}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cov.kit.ok ? 'bg-blue-100 text-blue-700' : 'bg-blue-200 text-blue-800 font-bold'}`}>
                      Kit {cov.kit.count}{!cov.kit.opener ? ' no open' : !cov.kit.closer ? ' no close' : cov.kit.ok ? '' : ' ✗'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cov.cs.ok ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-200 text-yellow-800 font-bold'}`}>
                      CS {cov.cs.count}/{cov.cs.need}{!cov.cs.ok ? ' ✗' : ''}
                    </span>
                  </div>
                </td>
              ))}
              <td />
            </tr>
            {/* Hours total row */}
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2 sticky left-0 bg-gray-50 font-medium text-gray-500">Total</td>
              {dailyTotals.map((t, i) => (
                <td key={i} className="text-center px-2 py-2 font-semibold text-gray-700">
                  {t > 0 ? t.toFixed(2) : '–'}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-bold text-gray-900">
                {dailyTotals.reduce((a, b) => a + b, 0).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── ShiftCell ────────────────────────────────────────────────────────────────

interface ShiftCellProps {
  shiftKey: string
  shift: ShiftData | null
  isEditing: boolean
  hasFixture: boolean
  isSaturday: boolean
  isSchool: boolean
  suggestedRole: string
  emptyClass: string
  isOpen: boolean
  onOpen: () => void
  onChange: (data: ShiftData | null) => void
}

function ShiftCell({ shift, isEditing, hasFixture, isSchool, suggestedRole, emptyClass, onOpen, onChange }: ShiftCellProps) {
  const [start, setStart] = useState(shift?.start_time ?? '05:45')
  const [end, setEnd] = useState(shift?.end_time ?? '14:00')
  const [role, setRole] = useState(shift?.role ?? suggestedRole)
  const [hasSplit, setHasSplit] = useState(!!shift?.split_time)
  const [splitAt, setSplitAt] = useState(shift?.split_time ?? '11:00')
  const [splitRole, setSplitRole] = useState(shift?.split_role ?? 'kitchen_cook')
  const [notes, setNotes] = useState(shift?.notes ?? '')

  // Sync when shift changes externally
  useEffect(() => {
    setStart(shift?.start_time ?? '05:45')
    setEnd(shift?.end_time ?? '14:00')
    setRole(shift?.role ?? suggestedRole)
    setHasSplit(!!shift?.split_time)
    setSplitAt(shift?.split_time ?? '11:00')
    setSplitRole(shift?.split_role ?? 'kitchen_cook')
    setNotes(shift?.notes ?? '')
  }, [shift])

  function apply() {
    onChange({
      start_time: start, end_time: end, role,
      split_time: hasSplit ? splitAt : undefined,
      split_role: hasSplit ? splitRole : undefined,
      notes: notes || undefined,
    })
  }

  const displayRole = shift?.split_time ? 'split' : (shift?.role ?? '')
  const c = ROLE_COLOR[displayRole] ?? ROLE_COLOR[shift?.role ?? '']

  return (
    <div className="relative">
      <button onClick={onOpen}
        className={`w-full min-h-[54px] rounded border text-left px-2 py-1.5 transition-all ${
          shift
            ? `${c?.bg} ${c?.border} ${c?.text}`
            : hasFixture
              ? 'bg-orange-50 border-orange-200 border-dashed text-orange-400'
              : emptyClass
        }`}>
        {shift ? (
          <div className="space-y-0.5">
            <div className="font-semibold text-[11px] leading-tight">{fmt(shift.start_time)} – {fmt(shift.end_time)}</div>
            {shift.split_time && (
              <div className="text-[10px] opacity-70">↕ {fmt(shift.split_time)} {ROLE_COLOR[shift.split_role ?? '']?.label ?? shift.split_role}</div>
            )}
            {shift.notes && <div className="text-[10px] opacity-60 truncate max-w-[100px]">{shift.notes}</div>}
          </div>
        ) : (
          <span className="text-[11px]">{hasFixture ? '⚽ game' : isSchool ? '3:30pm+' : '+'}</span>
        )}
      </button>

      {isEditing && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl p-3 space-y-3 w-60">
          {/* Times */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="text-[10px] font-medium text-gray-500">Start</span>
              <input type="time" value={start} onChange={e => setStart(e.target.value)}
                className="block w-full border border-gray-200 rounded px-2 py-1 text-xs" />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-medium text-gray-500">End</span>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                className="block w-full border border-gray-200 rounded px-2 py-1 text-xs" />
            </label>
          </div>

          {/* Role */}
          <div>
            <span className="text-[10px] font-medium text-gray-500 block mb-1">Role</span>
            <div className="flex flex-wrap gap-1">
              {ROLE_OPTIONS.map(opt => {
                const rc = ROLE_COLOR[opt.value]
                return (
                  <button key={opt.value} onClick={() => setRole(opt.value)}
                    className={`text-[10px] px-2 py-1 rounded border font-medium transition-all ${rc.bg} ${rc.border} ${rc.text} ${
                      role === opt.value ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-50 hover:opacity-80'
                    }`}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Split shift */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={hasSplit} onChange={e => setHasSplit(e.target.checked)} className="rounded" />
              <span className="text-[11px] font-medium text-gray-600">Split shift</span>
            </label>
            {hasSplit && (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-gray-500">Split at</span>
                  <input type="time" value={splitAt} onChange={e => setSplitAt(e.target.value)}
                    className="block w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-gray-500">2nd role</span>
                  <select value={splitRole} onChange={e => setSplitRole(e.target.value)}
                    className="block w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Notes */}
          <label className="block space-y-0.5">
            <span className="text-[10px] font-medium text-gray-500">Notes</span>
            <input type="text" placeholder="e.g. till 12, 2.30 available…" value={notes}
              onChange={e => setNotes(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && apply()}
              className="block w-full border border-gray-200 rounded px-2 py-1 text-xs" />
          </label>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={apply}
              className="flex-1 bg-gray-900 text-white text-xs py-1.5 rounded-lg hover:bg-gray-800">
              Apply
            </button>
            <button onClick={() => onChange(null)}
              className="px-3 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
