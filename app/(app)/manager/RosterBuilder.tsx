'use client'

import { useState, useMemo } from 'react'
import { ROLE_LABELS } from '@/lib/types'
import type { Role } from '@/lib/types'

interface StaffMember {
  id: string
  full_name: string
  hourly_rate?: number
  min_hours_week?: number
  max_hours_week?: number
  sport_team_id?: string
  sport_teams?: { id: string; name: string; sport: string } | null
}

interface StaffRole { user_id: string; role: Role; skill_level: number }
interface AvailRow { user_id: string; day_of_week: string; start_time: string; end_time: string }
interface UnavailRow { user_id: string; date: string }
interface AvailChange { user_id: string; effective_from: string; effective_to?: string; day_of_week: string; start_time?: string; end_time?: string; unavailable: boolean }
interface Fixture { team_id: string; date: string; round?: number; kickoff?: string; home_team?: string; away_team?: string; venue?: string; is_home: boolean }

interface Settings {
  cafeOpen: string
  cafeClose: string
  preBuffer: number
  postBuffer: number
  gameDuration: number
}

interface Props {
  staff: StaffMember[]
  staffRoles: StaffRole[]
  availability: AvailRow[]
  unavailability: UnavailRow[]
  availabilityChanges: AvailChange[]
  fixtures: Fixture[]
  settings: Settings
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SORT_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'available', label: 'Most available' },
  { value: 'cheap', label: 'Cheapest first' },
  { value: 'skilled', label: 'Most skilled' },
]

export default function RosterBuilder({ staff, staffRoles, availability, unavailability, availabilityChanges, fixtures, settings }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [sort, setSort] = useState('manual')
  const [order, setOrder] = useState<string[]>(staff.map(s => s.id))

  // Generate next 14 days
  const dates = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i)
      return d.toISOString().split('T')[0]
    })
  }, [])

  const rolesByUser = useMemo(() => {
    return staffRoles.reduce<Record<string, StaffRole[]>>((acc, r) => {
      if (!acc[r.user_id]) acc[r.user_id] = []
      acc[r.user_id].push(r)
      return acc
    }, {})
  }, [staffRoles])

  function getFixtureForStaff(staffId: string, date: string): Fixture | null {
    const member = staff.find(s => s.id === staffId)
    if (!member?.sport_team_id) return null
    return fixtures.find(f => f.team_id === member.sport_team_id && f.date === date) ?? null
  }

  function isUnavailable(staffId: string, date: string): boolean {
    return unavailability.some(u => u.user_id === staffId && u.date === date)
  }

  function getAvailWindow(staffId: string, date: string): { start: string; end: string } | null {
    const dayOfWeek = DAY_NAMES[new Date(date + 'T00:00:00').getDay()]

    // Check availability changes effective on this date
    const change = availabilityChanges.find(c =>
      c.user_id === staffId &&
      c.day_of_week === dayOfWeek &&
      c.effective_from <= date &&
      (!c.effective_to || c.effective_to >= date)
    )
    if (change) {
      if (change.unavailable) return null
      return { start: change.start_time ?? settings.cafeOpen, end: change.end_time ?? settings.cafeClose }
    }

    // Regular availability
    const avail = availability.find(a => a.user_id === staffId && a.day_of_week === dayOfWeek)
    if (!avail) return null
    return { start: avail.start_time, end: avail.end_time }
  }

  function getGameBlock(fixture: Fixture | null): { start: string; end: string } | null {
    if (!fixture?.kickoff) return null
    const [h, m] = fixture.kickoff.split(':').map(Number)
    const kickoffMins = h * 60 + m
    const startMins = kickoffMins - settings.preBuffer
    const endMins = kickoffMins + settings.gameDuration + settings.postBuffer
    return {
      start: minsToTime(startMins),
      end: minsToTime(endMins),
    }
  }

  function getFreeWindows(avail: { start: string; end: string } | null, game: { start: string; end: string } | null) {
    if (!avail) return []
    if (!game) return [avail]

    const windows = []
    const aStart = timeToMins(avail.start)
    const aEnd = timeToMins(avail.end)
    const gStart = timeToMins(game.start)
    const gEnd = timeToMins(game.end)
    const cafeEnd = timeToMins(settings.cafeClose)

    if (gStart > aStart) {
      windows.push({ start: avail.start, end: minsToTime(Math.min(gStart, aEnd, cafeEnd)) })
    }
    if (gEnd < aEnd) {
      windows.push({ start: minsToTime(Math.max(gEnd, timeToMins(settings.cafeOpen))), end: minsToTime(Math.min(aEnd, cafeEnd)) })
    }
    return windows.filter(w => timeToMins(w.end) > timeToMins(w.start) + 15)
  }

  // Sort staff based on selected mode
  const sortedStaff = useMemo(() => {
    const base = sort === 'manual' ? order.map(id => staff.find(s => s.id === id)).filter(Boolean) as StaffMember[] : [...staff]
    if (sort === 'available') {
      return base.sort((a, b) => {
        const aWindow = getAvailWindow(a.id, selectedDate)
        const bWindow = getAvailWindow(b.id, selectedDate)
        const aGame = getGameBlock(getFixtureForStaff(a.id, selectedDate))
        const bGame = getGameBlock(getFixtureForStaff(b.id, selectedDate))
        const aFree = getFreeWindows(aWindow, aGame).reduce((sum, w) => sum + timeToMins(w.end) - timeToMins(w.start), 0)
        const bFree = getFreeWindows(bWindow, bGame).reduce((sum, w) => sum + timeToMins(w.end) - timeToMins(w.start), 0)
        return bFree - aFree
      })
    }
    if (sort === 'cheap') return base.sort((a, b) => (a.hourly_rate ?? 999) - (b.hourly_rate ?? 999))
    if (sort === 'skilled') {
      return base.sort((a, b) => {
        const aMax = Math.max(...(rolesByUser[a.id] ?? [{ skill_level: 0 }]).map(r => r.skill_level))
        const bMax = Math.max(...(rolesByUser[b.id] ?? [{ skill_level: 0 }]).map(r => r.skill_level))
        return bMax - aMax
      })
    }
    return base
  }, [sort, order, staff, selectedDate, availability, unavailability, fixtures])

  const cafeOpenMins = timeToMins(settings.cafeOpen)
  const cafeCloseMins = timeToMins(settings.cafeClose)
  const totalMins = cafeCloseMins - cafeOpenMins

  function pct(time: string) {
    return ((timeToMins(time) - cafeOpenMins) / totalMins) * 100
  }

  function widthPct(start: string, end: string) {
    return ((timeToMins(end) - timeToMins(start)) / totalMins) * 100
  }

  const hourLabels = useMemo(() => {
    const labels = []
    for (let m = cafeOpenMins; m <= cafeCloseMins; m += 60) {
      labels.push({ time: minsToTime(m), pct: ((m - cafeOpenMins) / totalMins) * 100 })
    }
    return labels
  }, [cafeOpenMins, cafeCloseMins, totalMins])

  const SPORT_COLORS: Record<string, string> = {
    soccer: 'bg-blue-500',
    rugby: 'bg-cyan-600',
    netball: 'bg-orange-500',
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Roster Builder</h1>
        <a href="/manager/teams" className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5">
          Refresh fixtures
        </a>
      </div>

      {/* Date picker */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {dates.map(date => {
          const d = new Date(date + 'T00:00:00')
          const dayName = DAY_NAMES[d.getDay()]
          const label = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
          return (
            <button key={date} onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                date === selectedDate
                  ? 'bg-gray-900 text-white border-transparent'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}>
              <span>{dayName} {label}</span>
            </button>
          )
        })}
      </div>

      {/* Sort */}
      <div className="flex gap-1.5 mb-4">
        {SORT_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setSort(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              sort === opt.value
                ? 'bg-gray-900 text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Roster grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">
            {formatDate(selectedDate)} · {settings.cafeOpen.slice(0, 5).replace(':', '').replace(/^0/, '')}am–{settings.cafeClose.slice(0, 5)}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {sortedStaff.map(member => {
            const fixture = getFixtureForStaff(member.id, selectedDate)
            const unavail = isUnavailable(member.id, selectedDate)
            const availWindow = unavail ? null : getAvailWindow(member.id, selectedDate)
            const gameBlock = getGameBlock(fixture)
            const freeWindows = getFreeWindows(availWindow, gameBlock)
            const roles = rolesByUser[member.id] ?? []
            const sport = member.sport_teams?.sport ?? ''
            const sportColor = SPORT_COLORS[sport] ?? 'bg-gray-400'

            return (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                {/* Name + info */}
                <div className="w-48 shrink-0">
                  <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
                  {fixture && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {member.sport_teams?.sport} {fixture.kickoff ? formatTime(fixture.kickoff) : 'TBC'}
                    </p>
                  )}
                  {unavail && <p className="text-xs text-red-500 mt-0.5">Unavailable</p>}
                  {!unavail && !availWindow && !fixture && (
                    <p className="text-xs text-gray-400 mt-0.5">No availability set</p>
                  )}
                  {freeWindows.length > 0 && (
                    <p className="text-xs text-green-700 mt-0.5">
                      {freeWindows.map(w => `${formatTime(w.start)}–${formatTime(w.end)}`).join(' · ')}
                    </p>
                  )}
                  {member.hourly_rate && (
                    <p className="text-xs text-gray-400">${member.hourly_rate}/hr</p>
                  )}
                  {roles.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {roles.map(r => (
                        <span key={r.role} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                          {ROLE_LABELS[r.role].split(' ')[0]} {r.skill_level}★
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="relative h-10 flex-1 rounded border border-gray-200 bg-gray-50">
                  {/* Hour lines */}
                  {hourLabels.slice(1, -1).map(h => (
                    <div key={h.time} className="absolute top-0 bottom-0 w-px bg-gray-200"
                      style={{ left: `${h.pct}%` }} />
                  ))}

                  {/* Free windows */}
                  {freeWindows.map((w, i) => (
                    <div key={i}
                      className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden bg-green-500/10"
                      style={{ left: `${pct(w.start)}%`, width: `${widthPct(w.start, w.end)}%` }}>
                      <span className="text-[10px] font-medium text-green-700 whitespace-nowrap">
                        {formatTime(w.start)}–{formatTime(w.end)}
                      </span>
                    </div>
                  ))}

                  {/* Game block */}
                  {gameBlock && availWindow && (
                    <>
                      <div className={`absolute top-0 bottom-0 ${sportColor}/30`}
                        style={{ left: `${pct(gameBlock.start)}%`, width: `${widthPct(gameBlock.start, fixture?.kickoff ? minsToTime(timeToMins(fixture.kickoff)) : gameBlock.start)}%` }} />
                      {fixture?.kickoff && (
                        <div className={`absolute top-0 bottom-0 ${sportColor}`}
                          style={{ left: `${pct(fixture.kickoff)}%`, width: `${widthPct(fixture.kickoff, minsToTime(timeToMins(fixture.kickoff) + settings.gameDuration))}%` }} />
                      )}
                      <div className={`absolute top-0 bottom-0 ${sportColor}/30`}
                        style={{
                          left: `${pct(minsToTime(timeToMins(fixture?.kickoff ?? gameBlock.start) + settings.gameDuration))}%`,
                          width: `${widthPct(minsToTime(timeToMins(fixture?.kickoff ?? gameBlock.start) + settings.gameDuration), gameBlock.end)}%`
                        }} />
                    </>
                  )}

                  {/* Unavailable overlay */}
                  {unavail && (
                    <div className="absolute inset-0 bg-red-100/60 flex items-center justify-center">
                      <span className="text-[10px] text-red-600 font-medium">Unavailable</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Hour axis */}
        <div className="flex px-4 pb-2 pt-1">
          <div className="w-48 shrink-0" />
          <div className="relative flex-1 h-4">
            {hourLabels.map(h => (
              <span key={h.time}
                className="absolute text-[10px] text-gray-400 whitespace-nowrap"
                style={{
                  left: `${h.pct}%`,
                  transform: h.pct === 0 ? 'none' : h.pct >= 98 ? 'translateX(-100%)' : 'translateX(-50%)',
                }}>
                {formatTime(h.time)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Utilities
function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTime(time: string): string {
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 || 12
  return parseInt(m) === 0 ? `${h12}${ampm}` : `${h12}:${m}${ampm}`
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}
