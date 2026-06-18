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
  min_hours_week?: number | null
  max_hours_week?: number | null
  preference?: number | null
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
  kitchen_cook:      { bg: 'bg-blue-200',   border: 'border-blue-400',   text: 'text-blue-900',   label: 'Kitchen' },
  kitchen_cook_prep: { bg: 'bg-blue-200',   border: 'border-blue-400',   text: 'text-blue-900',   label: 'Kitchen' },
  dishwasher:        { bg: 'bg-sky-100',    border: 'border-sky-300',    text: 'text-sky-900',    label: 'Dishes' },
  cs_dish:           { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-900', label: 'CS + Dish' },
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

  // ── Build roster from min hours + skills + preference ────────────────────
  function buildRoster() {
    const timeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }

    // Build candidate list: every (staff, day) combo where a template exists
    type Slot = {
      memberId: string
      dateStr: string
      di: number
      startTime: string
      endTime: string
      bestRole: string
      bestSkill: number
      hours: number
    }

    const slots: Slot[] = []
    for (const m of staff) {
      for (let di = 0; di < 6; di++) {
        const dateStr = toDateStr(weekDates[di])
        if (unavailSet.has(`${m.id}_${dateStr}`)) continue
        const tmpl = templates.find(t => t.user_id === m.id && t.day_of_week === DAYS[di])
        if (!tmpl?.start_time) continue

        const isSchool = !!m.is_school_student
        const startMins = timeToMins(tmpl.start_time)
        // School kids can't work weekday mornings
        if (isSchool && di < 5 && startMins < 14 * 60) continue

        const memberRoles = (rolesByUser[m.id] ?? []).slice().sort((a, b) => b.skill_level - a.skill_level)
        if (!memberRoles.length) continue
        const best = memberRoles[0]

        const hours = (timeToMins(tmpl.end_time) - startMins) / 60
        slots.push({
          memberId: m.id, dateStr, di,
          startTime: tmpl.start_time, endTime: tmpl.end_time,
          bestRole: best.role, bestSkill: best.skill_level,
          hours: Math.max(hours, 0),
        })
      }
    }

    const next: Record<string, ShiftData> = {}
    const assignedDays = new Set<string>()   // `${memberId}_${dateStr}`
    const hoursGiven: Record<string, number> = {}
    for (const m of staff) hoursGiven[m.id] = 0

    const getMax = (m: StaffMember) => (m.max_hours_week && m.max_hours_week > 0) ? m.max_hours_week : 40
    const getMin = (m: StaffMember) => m.min_hours_week ?? 0
    const getPref = (m: StaffMember) => m.preference ?? 3

    const assign = (slot: Slot) => {
      const key = `${slot.memberId}_${slot.dateStr}`
      if (assignedDays.has(key)) return
      const m = staff.find(x => x.id === slot.memberId)!
      if (hoursGiven[slot.memberId] + slot.hours > getMax(m) + 0.5) return
      next[key] = { start_time: slot.startTime, end_time: slot.endTime, role: slot.bestRole }
      assignedDays.add(key)
      hoursGiven[slot.memberId] += slot.hours
    }

    // ── Phase 1: hit minimum hours ──────────────────────────────────────────
    // Repeatedly pick the staff member furthest below their minimum and
    // assign their highest-skill available slot for the day.
    let progress = true
    while (progress) {
      progress = false
      // Find staff still below minimum, sorted by deficit descending
      const needMin = staff
        .filter(m => hoursGiven[m.id] < getMin(m))
        .map(m => ({ m, deficit: getMin(m) - hoursGiven[m.id] }))
        .sort((a, b) => b.deficit - a.deficit || b.m.preference! - a.m.preference!)

      for (const { m } of needMin) {
        // Best unassigned slot for this person (highest skill, no day conflict)
        const best = slots
          .filter(s => s.memberId === m.id && !assignedDays.has(`${s.memberId}_${s.dateStr}`))
          .sort((a, b) => b.bestSkill - a.bestSkill)[0]
        if (!best) continue
        assign(best)
        progress = true
        break // restart loop so deficits are recalculated
      }
    }

    // ── Phase 2: fill remaining by preference ───────────────────────────────
    const remaining = slots
      .filter(s => !assignedDays.has(`${s.memberId}_${s.dateStr}`))
      .map(s => {
        const m = staff.find(x => x.id === s.memberId)!
        return { s, pref: getPref(m), skill: s.bestSkill }
      })
      .sort((a, b) => b.pref - a.pref || b.skill - a.skill)

    for (const { s } of remaining) {
      const m = staff.find(x => x.id === s.memberId)!
      if (hoursGiven[s.memberId] >= getMax(m)) continue
      assign(s)
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

  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function clearRoster() {
    if (!confirm('Clear all shifts for this week? This cannot be undone.')) return
    setClearing(true)
    const start = toDateStr(weekStart)
    const end = toDateStr(addDays(weekStart, 5))
    await supabase.from('roster_shifts').delete().gte('date', start).lte('date', end)
    setShifts({})
    setHasRoster(false)
    setPublished(false)
    setEditKey(null)
    setClearing(false)
  }

  async function refreshWeek() {
    setRefreshing(true)
    const start = toDateStr(weekStart)
    const end = toDateStr(addDays(weekStart, 5))
    const [{ data }, { data: unavail }] = await Promise.all([
      supabase.from('roster_shifts').select('*').gte('date', start).lte('date', end),
      supabase.from('unavailability').select('user_id, date').gte('date', start).lte('date', end),
    ])
    if (!data || data.length === 0) { setShifts({}); setHasRoster(false); setPublished(false); setEditKey(null) }
    else {
      setShifts(dbShiftsToMap(data))
      setHasRoster(true)
      setPublished(data.some((s: any) => s.published))
      setEditKey(null)
    }
    setUnavailSet(new Set((unavail ?? []).map((u: any) => `${u.user_id}_${u.date}`)))
    setRefreshing(false)
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

  async function markUnavailable(userId: string, date: string) {
    await Promise.all([
      supabase.from('unavailability').upsert({ user_id: userId, date, reason: 'unavailable' }, { onConflict: 'user_id,date' }),
      supabase.from('roster_shifts').delete().eq('user_id', userId).eq('date', date),
    ])
    setUnavailSet(s => new Set([...s, `${userId}_${date}`]))
    setShift(userId, date, null)
    setEditKey(null)
  }

  async function removeUnavailability(userId: string, date: string) {
    await supabase.from('unavailability').delete().eq('user_id', userId).eq('date', date)
    setUnavailSet(s => { const n = new Set(s); n.delete(`${userId}_${date}`); return n })
    setEditKey(null)
  }

  // ── Auto-fill from Requirements ──────────────────────────────────────────

  // Read structured rules (cafeRules_v1). Falls back to old text prefs for backward compat.
  function loadActiveRules(): import('./RuleBuilder').Rule[] {
    try {
      const raw = localStorage.getItem('cafeRules_v1')
      if (raw) {
        const parsed = JSON.parse(raw) as import('./RuleBuilder').Rule[]
        return parsed.filter(r => r.enabled)
      }
      // Backward compat: read old text prefs and convert to rule signals
      const oldRaw = localStorage.getItem('cafePreferences_v1')
      if (!oldRaw) return []
      const oldPrefs = JSON.parse(oldRaw) as { text: string; enabled: boolean }[]
      const texts = oldPrefs.filter(p => p.enabled).map(p => p.text.toLowerCase())
      const rules: import('./RuleBuilder').Rule[] = []
      if (texts.some(p => p.includes('junior')))
        rules.push({ id: 'compat_1', enabled: true, type: 'prefer_group', group: 'school', role: 'any', day: 'any' })
      if (texts.some(p => p.includes('4 star') || (p.includes('kitchen') && p.includes('till 2'))))
        rules.push({ id: 'compat_2', enabled: true, type: 'require_skill', role: 'kitchen_cook', skillMin: 4, timeCondition: 'until', timeValue: '14:00' })
      if (texts.some(p => p.includes('wage') || p.includes('save')))
        rules.push({ id: 'compat_3', enabled: true, type: 'prefer_cost', costDir: 'cheaper' })
      return rules
    } catch { return [] }
  }

  // Split a long requirement bar into human-sized segments.
  // Target: 5–6h per person. Kitchen can go up to 9h but prefer to split too.
  function splitToSegments(role: string, startMin: number, endMin: number) {
    const isKitchen = role === 'kitchen_cook' || role === 'kitchen_cook_prep'
    const softMax   = 6 * 60   // 6 hours — prefer not to exceed
    const hardMax   = isKitchen ? 9 * 60 : 6 * 60
    const target    = isKitchen ? 7 * 60 : 5.5 * 60  // aim for 7h kitchen, 5.5h other
    const duration  = endMin - startMin

    if (duration <= softMax) return [{ startMin, endMin }]

    const segments: { startMin: number; endMin: number }[] = []
    let cur = startMin
    while (cur < endMin) {
      const remaining = endMin - cur
      if (remaining <= hardMax) {
        segments.push({ startMin: cur, endMin })
        break
      }
      // Snap split point to nearest 30 min, aiming for target duration
      let split = cur + target
      split = Math.round(split / 30) * 30
      // Don't leave a rump shift shorter than 2.5h
      if (endMin - split < 2.5 * 60) split = cur + Math.round((remaining / 2) / 30) * 30
      segments.push({ startMin: cur, endMin: split })
      cur = split
    }
    return segments
  }

  async function autoFill() {
    let reqs: Record<string, { role: string; startMin: number; endMin: number; label?: string }[]> = {}
    try {
      const res = await fetch('/api/requirements')
      if (res.ok) {
        const rows: { day_of_week: string; role: string; start_min: number; end_min: number; label?: string }[] = await res.json()
        for (const r of rows) {
          if (!reqs[r.day_of_week]) reqs[r.day_of_week] = []
          reqs[r.day_of_week].push({ role: r.role, startMin: r.start_min, endMin: r.end_min, label: r.label })
        }
      } else {
        // fallback to localStorage
        reqs = JSON.parse(localStorage.getItem('cafeRequirements_v1') ?? '{}')
      }
    } catch {
      try { reqs = JSON.parse(localStorage.getItem('cafeRequirements_v1') ?? '{}') } catch { return }
    }
    if (!Object.keys(reqs).length) return

    const activeRules = loadActiveRules()

    const minToTime = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    const next: Record<string, ShiftData> = {}

    weekDates.forEach((date, di) => {
      const dayName  = DAYS[di] as string
      const rawSlots = (reqs[dayName] ?? []).slice().sort((a, b) => a.startMin - b.startMin)
      if (!rawSlots.length) return

      const dateStr = toDateStr(date)
      const assignedToday = new Set<string>()
      const hoursAssignedToday = new Map<string, number>()

      const segments = rawSlots.flatMap(slot =>
        splitToSegments(slot.role, slot.startMin, slot.endMin).map(seg => ({ ...slot, ...seg }))
      )

      const roleMatches = (staffRole: string, reqRole: string) =>
        staffRole === reqRole ||
        (reqRole === 'kitchen_cook'      && staffRole === 'kitchen_cook_prep') ||
        (reqRole === 'kitchen_cook_prep' && staffRole === 'kitchen_cook') ||
        (reqRole === 'customer_service'  && staffRole === 'floor_staff') ||
        (reqRole === 'floor_staff'       && staffRole === 'customer_service')

      const canDoCsDish = (m: typeof staff[0]) => {
        const roles = (rolesByUser[m.id] ?? []).map(r => r.role)
        return roles.some(r => r === 'customer_service' || r === 'floor_staff')
          && roles.some(r => r === 'dishwasher')
      }

      const ruleRoleOk = (ruleRole: string | undefined, segRole: string) =>
        !ruleRole || ruleRole === 'any' || ruleRole === segRole ||
        (ruleRole === 'kitchen_cook' && (segRole === 'kitchen_cook' || segRole === 'kitchen_cook_prep')) ||
        (ruleRole === 'customer_service' && (segRole === 'customer_service' || segRole === 'floor_staff' || segRole === 'cs_dish'))

      const ruleDayOk = (ruleDay: string | undefined) =>
        !ruleDay || ruleDay === 'any' || ruleDay === dayName

      for (const seg of segments) {
        const isCsDish      = seg.role === 'cs_dish'
        const isAfternoonCS = (seg.role === 'customer_service' || seg.role === 'floor_staff' || isCsDish) && seg.startMin >= 14 * 60
        const segMins       = seg.endMin - seg.startMin

        const avoidedToday = new Set<string>(
          activeRules
            .filter(r => r.type === 'avoid_day' && ruleDayOk(r.day) && r.staffId)
            .map(r => r.staffId!)
        )

        const minShiftRule = activeRules.find(r => r.type === 'min_shift')
        const minShiftMins        = (minShiftRule?.minHours ?? 2) * 60
        const juniorMinShiftMins  = (minShiftRule?.juniorMinHours ?? 1.5) * 60
        const juniorOnlyIfCheaper = minShiftRule?.juniorOnlyIfCheaper ?? true

        const candidates = staff.filter(m => {
          if (assignedToday.has(m.id)) return false
          if (unavailSet.has(`${m.id}_${dateStr}`)) return false
          if (avoidedToday.has(m.id)) return false
          const maxRule = activeRules.find(r => r.type === 'max_hours' && r.staffId === m.id)
          if (maxRule?.maxHours && (hoursAssignedToday.get(m.id) ?? 0) + segMins > maxRule.maxHours * 60) return false
          const isSchool = !!(m as any).is_school_student
          // Minimum shift length enforcement
          if (minShiftRule) {
            const threshold = isSchool ? juniorMinShiftMins : minShiftMins
            if (segMins < threshold) return false
          }
          if (isCsDish) return canDoCsDish(m)
          return (rolesByUser[m.id] ?? []).some(r => roleMatches(r.role, seg.role))
        })

        if (!candidates.length) continue

        const scored = candidates.map(m => {
          let skill = 1
          if (isCsDish) {
            const csMatch   = (rolesByUser[m.id] ?? []).find(r => r.role === 'customer_service' || r.role === 'floor_staff')
            const dishMatch = (rolesByUser[m.id] ?? []).find(r => r.role === 'dishwasher')
            skill = Math.min(csMatch?.skill_level ?? 1, dishMatch?.skill_level ?? 1)
          } else {
            const roleMatch = (rolesByUser[m.id] ?? []).find(r => roleMatches(r.role, seg.role))
            skill = roleMatch?.skill_level ?? 1
          }
          const isSchool = !!(m as any).is_school_student
          let score = skill

          for (const rule of activeRules) {
            switch (rule.type) {
              case 'require_skill': {
                if (!ruleRoleOk(rule.role, seg.role) || !ruleDayOk(rule.day)) break
                const tVal = rule.timeValue
                  ? parseInt(rule.timeValue.split(':')[0]) * 60 + parseInt(rule.timeValue.split(':')[1])
                  : 0
                const applies =
                  rule.timeCondition === 'until' ? seg.endMin >= tVal :
                  rule.timeCondition === 'from'  ? seg.startMin >= tVal : true
                if (applies && skill < (rule.skillMin ?? 1)) return { m, score: -999 }
                break
              }
              case 'prefer_group': {
                if (!ruleRoleOk(rule.role, seg.role) || !ruleDayOk(rule.day)) break
                if (rule.group === 'school' && isSchool) score += 30
                if (rule.group === 'senior' && !isSchool) score += 30
                break
              }
              case 'prefer_cost': {
                const rate = isSchool ? 15 : ((m as any).hourly_rate ?? 25)
                if (rule.costDir === 'cheaper') score -= (rate - 15) * 0.3
                else score += (rate - 15) * 0.2
                break
              }
              case 'prefer_staff': {
                if (m.id !== rule.staffId || !ruleRoleOk(rule.role, seg.role) || !ruleDayOk(rule.day)) break
                score += 25
                break
              }
            }
          }

          // School availability constraint (always enforced regardless of rules)
          if (isAfternoonCS) {
            const tmpl      = templates.find(t => t.user_id === m.id && t.day_of_week === dayName)
            const availFrom = tmpl
              ? parseInt(tmpl.start_time.split(':')[0]) * 60 + parseInt(tmpl.start_time.split(':')[1])
              : 15 * 60 + 30
            if (seg.startMin < availFrom) return { m, score: -999 }
          } else {
            if (isSchool && seg.startMin < 15 * 60) return { m, score: -999 }
          }

          return { m, score }
        }).filter(x => x.score > -900).sort((a, b) => b.score - a.score)

        if (!scored.length) continue

        // If "juniors only if cheaper" is active, don't pick a school kid when a
        // non-school candidate with equal or better score exists
        let finalScored = scored
        if (minShiftRule && juniorOnlyIfCheaper) {
          const topScore = scored[0].score
          const nonSchoolTop = scored.find(x => !(x.m as any).is_school_student && x.score >= topScore - 5)
          if (nonSchoolTop && (scored[0].m as any).is_school_student) {
            finalScored = scored.filter(x => !(x.m as any).is_school_student)
            if (!finalScored.length) finalScored = scored
          }
        }

        const winner = finalScored[0].m
        assignedToday.add(winner.id)
        hoursAssignedToday.set(winner.id, (hoursAssignedToday.get(winner.id) ?? 0) + segMins)

        // cs_dish shows as dishwasher on the roster (they'll also cover CS/floor)
        let bestRole: string
        if (isCsDish) {
          bestRole = 'dishwasher'
        } else {
          bestRole = (rolesByUser[winner.id] ?? []).find(r => roleMatches(r.role, seg.role))?.role ?? seg.role
        }

        next[`${winner.id}_${dateStr}`] = {
          start_time: minToTime(seg.startMin),
          end_time:   minToTime(seg.endMin),
          role:       bestRole,
          notes:      isCsDish ? 'CS + Dish' : (seg.label ?? undefined),
        }
      }
    })

    setShifts(next)
    setHasRoster(true)
    setPublished(false)
  }

  const dailyTotals = useMemo(() => weekDates.map(date => {
    const ds = toDateStr(date)
    return staff.reduce((s, m) => { const sh = shifts[`${m.id}_${ds}`]; return s + (sh ? calcHours(sh.start_time, sh.end_time) : 0) }, 0)
  }), [weekDates, staff, shifts])

  const dailyCosts = useMemo(() => weekDates.map((date, di) => {
    const ds = toDateStr(date)
    const isSat = di === 5
    return staff.reduce((s, m) => {
      const sh = shifts[`${m.id}_${ds}`]
      if (!sh) return s
      const hrs = calcHours(sh.start_time, sh.end_time)
      const rate = isSat ? (m.saturday_rate ?? m.hourly_rate ?? 0) : (m.hourly_rate ?? 0)
      return s + hrs * rate
    }, 0)
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

  // Force these into kitchen regardless of skill mix
  const FORCE_KITCHEN_IDS = [
    '9beb8166-78ca-4b76-9385-bf5d2f2a58a2', // Nick
    '856b416c-9e73-478a-9960-85404a9962b6', // Oisin
    '711ab8b4-c9c1-4bb4-855d-e781f238f13a', // Jye
    '86f72d53-da1d-4ede-9f52-1a644758d1ff', // Aidan
  ]

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
    'afe088a9-3f42-47b8-b5c7-f94a9c95ca48', // Megan Thomas
  ]

  const GROUP_ORDER = ['manager', 'foh', 'new_staff', 'kitchen', 'school_senior', 'school_junior']
  const GROUP_META: Record<string, { label: string; rowBg: string; nameBg: string; headerBg: string; text: string; cellEmpty: string }> = {
    manager:      { label: 'Manager',           rowBg: 'bg-gray-100',    nameBg: 'bg-gray-100',   headerBg: 'bg-gray-200',    text: 'text-gray-700',   cellEmpty: 'bg-gray-100 border-gray-300 border-dashed' },
    foh:          { label: 'FOH',               rowBg: 'bg-yellow-50',   nameBg: 'bg-yellow-50',  headerBg: 'bg-yellow-100',  text: 'text-yellow-700', cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    new_staff:    { label: 'New Staff',         rowBg: 'bg-yellow-50',   nameBg: 'bg-yellow-50',  headerBg: 'bg-yellow-100',  text: 'text-yellow-700', cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    kitchen:      { label: 'Kitchen',           rowBg: 'bg-blue-50',     nameBg: 'bg-blue-50',    headerBg: 'bg-blue-100',    text: 'text-blue-700',   cellEmpty: 'bg-blue-50 border-blue-200 border-dashed' },
    school_senior:{ label: 'School — Senior',   rowBg: 'bg-yellow-50',   nameBg: 'bg-yellow-50',  headerBg: 'bg-yellow-100',  text: 'text-yellow-700', cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    school_junior:{ label: 'School — Junior',   rowBg: 'bg-green-50',    nameBg: 'bg-green-50',   headerBg: 'bg-green-100',   text: 'text-green-700',  cellEmpty: 'bg-green-50 border-green-200 border-dashed' },
  }

  function staffGroup(member: StaffMember): string {
    if (member.id === MANAGER_ID) return 'manager'
    if (NEW_STAFF_IDS.includes(member.id)) return 'new_staff'
    if (FORCE_KITCHEN_IDS.includes(member.id)) return 'kitchen'
    if (SENIOR_SCHOOL_IDS.includes(member.id)) return 'school_senior'
    if ((member as any).is_school_student) return 'school_junior'
    const roles = rolesByUser[member.id] ?? []
    const primary = autoRole(roles)
    if (primary === 'kitchen_cook' || primary === 'kitchen_cook_prep') return 'kitchen'
    return 'foh'
  }

  const GROUP_ROW: Record<string, { rowBg: string; nameBg: string; cellEmpty: string }> = {
    manager:       { rowBg: 'bg-gray-100',   nameBg: 'bg-gray-100',   cellEmpty: 'bg-gray-100 border-gray-300 border-dashed' },
    foh:           { rowBg: 'bg-yellow-50',  nameBg: 'bg-yellow-50',  cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    new_staff:     { rowBg: 'bg-yellow-50',  nameBg: 'bg-yellow-50',  cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    kitchen:       { rowBg: 'bg-blue-50',    nameBg: 'bg-blue-50',    cellEmpty: 'bg-blue-50 border-blue-200 border-dashed' },
    school_senior: { rowBg: 'bg-yellow-50',  nameBg: 'bg-yellow-50',  cellEmpty: 'bg-yellow-50 border-yellow-200 border-dashed' },
    school_junior: { rowBg: 'bg-green-50',   nameBg: 'bg-green-50',   cellEmpty: 'bg-green-50 border-green-200 border-dashed' },
  }

  function staffRowStyle(group: string) {
    return GROUP_ROW[group] ?? GROUP_ROW['new_staff']
  }

  function cellEmptyClass(group: string, _member: StaffMember): string {
    return staffRowStyle(group).cellEmpty
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
          <button onClick={refreshWeek} disabled={refreshing}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            {refreshing ? '↻…' : '↻ Refresh'}
          </button>
          {published && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
              ✓ Published
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!hasRoster ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={buildRoster}
                className="px-4 py-1.5 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800 font-medium">
                Build roster
              </button>
            </div>
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
              <button onClick={clearRoster} disabled={clearing}
                className="px-4 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 hover:border-red-300 disabled:opacity-50">
                {clearing ? 'Clearing…' : 'Clear roster'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(ROLE_COLOR).map(([r, c]) => (
          <span key={r} className={`text-[11px] px-2 py-0.5 rounded border ${c.bg} ${c.border} ${c.text}`}>{c.label}</span>
        ))}
        <span className="text-[11px] px-2 py-0.5 rounded border bg-gray-100 border-gray-400 text-gray-500 font-medium">OFF</span>
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
                <tr key={member.id} className={`${staffRowStyle(group).rowBg} border-b border-gray-100`}>
                  <td className={`px-3 py-1 sticky left-0 z-10 ${staffRowStyle(group).nameBg}`}>
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
                            isUnavail={isUnavail}
                            schoolFromTime={isSchool ? templates.find(t => t.user_id === member.id && t.day_of_week === DAYS[di])?.start_time ?? undefined : undefined}
                            suggestedRole={autoRole(roles)}
                            emptyClass={cellEmptyClass(group, member)}
                            isOpen={editKey === key}
                            onOpen={() => setEditKey(k => k === key ? null : key)}
                            onChange={(data) => { setShift(member.id, dateStr, data); setEditKey(null) }}
                            onMarkUnavailable={() => markUnavailable(member.id, dateStr)}
                            onRemoveUnavailability={() => removeUnavailability(member.id, dateStr)}
                          />
                          {isUnavail && (
                            <div className="absolute inset-0 rounded pointer-events-none bg-gray-400/20 border border-gray-400 flex items-center justify-center">
                              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded select-none">OFF</span>
                            </div>
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
              <td className="px-3 py-2 sticky left-0 bg-gray-50 font-medium text-gray-500">Total hrs</td>
              {dailyTotals.map((t, i) => (
                <td key={i} className="text-center px-2 py-2 font-semibold text-gray-700">
                  {t > 0 ? t.toFixed(1) : '–'}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-bold text-gray-900">
                {dailyTotals.reduce((a, b) => a + b, 0).toFixed(1)}
              </td>
            </tr>
            {/* Daily cost row */}
            <tr className="bg-green-50 border-t border-green-200">
              <td className="px-3 py-2 sticky left-0 bg-green-50 font-medium text-green-800">Cost ($)</td>
              {dailyCosts.map((c, i) => (
                <td key={i} className="text-center px-2 py-2 font-semibold text-green-700">
                  {c > 0 ? `$${c.toFixed(0)}` : '–'}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-bold text-green-900">
                ${dailyCosts.reduce((a, b) => a + b, 0).toFixed(0)}
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
  isUnavail: boolean
  schoolFromTime?: string
  suggestedRole: string
  emptyClass: string
  isOpen: boolean
  onOpen: () => void
  onChange: (data: ShiftData | null) => void
  onMarkUnavailable: () => void
  onRemoveUnavailability: () => void
}

function ShiftCell({ shift, isEditing, hasFixture, isSchool, isUnavail, schoolFromTime, suggestedRole, emptyClass, onOpen, onChange, onMarkUnavailable, onRemoveUnavailability }: ShiftCellProps) {
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
            <div className="text-[10px] opacity-75 font-medium">{c?.label ?? shift.role}</div>
            {shift.split_time && (
              <div className="text-[10px] opacity-70">↕ {fmt(shift.split_time)} {ROLE_COLOR[shift.split_role ?? '']?.label ?? shift.split_role}</div>
            )}
            {shift.notes && <div className="text-[10px] opacity-60 truncate max-w-[100px]">{shift.notes}</div>}
          </div>
        ) : (
          <span className="text-[11px]">{hasFixture ? '⚽ game' : isSchool ? `from ${schoolFromTime ? fmt(schoolFromTime) : '3:30pm'}` : '+'}</span>
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
          <div className="border-t border-gray-100 pt-2">
            {isUnavail ? (
              <button onClick={onRemoveUnavailability}
                className="w-full text-xs py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                Remove unavailability
              </button>
            ) : (
              <button onClick={onMarkUnavailable}
                className="w-full text-xs py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100">
                Mark as unavailable
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
