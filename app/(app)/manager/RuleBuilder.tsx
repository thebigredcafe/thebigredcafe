'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export type RuleType =
  | 'prefer_group'
  | 'require_skill'
  | 'prefer_cost'
  | 'prefer_staff'
  | 'max_hours'
  | 'max_role_hours'
  | 'avoid_day'
  | 'min_shift'
  | 'note'

export interface Rule {
  id: string
  enabled: boolean
  type: RuleType
  // prefer_group
  group?: 'school' | 'senior'
  // role / day shared across types
  role?: string  // 'any' | role key
  day?: string   // 'any' | 'Mon'...'Sat'
  // require_skill
  skillMin?: number
  timeCondition?: 'any' | 'until' | 'from'
  timeValue?: string
  // prefer_cost
  costDir?: 'cheaper' | 'pricier'
  // prefer_staff / max_hours / avoid_day
  staffId?: string
  minWeekHours?: number
  maxHours?: number
  // max_role_hours
  minRoleHours?: number
  maxRoleHours?: number
  // min_shift
  minHours?: number
  juniorMinHours?: number
  juniorOnlyIfCheaper?: boolean
  // note
  noteText?: string
}

export const RULE_STORAGE_KEY = 'cafeRules_v1'

const ROLE_OPTIONS = [
  { value: 'any',               label: 'Any role' },
  { value: 'customer_service',  label: 'Customer Service' },
  { value: 'kitchen_cook',      label: 'Kitchen Cook' },
  { value: 'kitchen_cook_prep', label: 'Kitchen Prep' },
  { value: 'dishwasher',        label: 'Dishwasher' },
  { value: 'barista',           label: 'Barista' },
  { value: 'cs_dish',           label: 'CS + Dish' },
]

const DAY_OPTIONS = [
  { value: 'any', label: 'any day' },
  { value: 'Mon', label: 'Monday' },
  { value: 'Tue', label: 'Tuesday' },
  { value: 'Wed', label: 'Wednesday' },
  { value: 'Thu', label: 'Thursday' },
  { value: 'Fri', label: 'Friday' },
  { value: 'Sat', label: 'Saturday' },
]

const RULE_TYPE_OPTIONS: { value: RuleType; label: string; description: string }[] = [
  { value: 'prefer_group',  label: 'Prefer group',    description: 'Boost a group (school kids / seniors) for a role' },
  { value: 'require_skill', label: 'Require skill',   description: 'Enforce a minimum skill level for a role and time' },
  { value: 'prefer_cost',   label: 'Prefer cheaper',  description: 'Prefer lower (or higher) wage staff when skill is equal' },
  { value: 'prefer_staff',  label: 'Prefer person',   description: 'Prefer a specific staff member for a role/day' },
  { value: 'max_hours',      label: 'Hours (person)', description: 'Set min and max weekly hours for a staff member' },
  { value: 'max_role_hours', label: 'Hours (role)',   description: 'Set min and max daily hours for a specific role' },
  { value: 'avoid_day',      label: 'Avoid on day',       description: 'Never auto-assign a staff member on a given day' },
  { value: 'min_shift',     label: 'Min shift length', description: 'Minimum hours for a shift; school kids can be shorter but only if cheaper' },
  { value: 'note',          label: 'Note / reminder', description: 'A text note — does not affect auto-fill, just for your reference' },
]

function defaultForType(type: RuleType): Partial<Rule> {
  switch (type) {
    case 'prefer_group':  return { group: 'school', role: 'any', day: 'any' }
    case 'require_skill': return { role: 'kitchen_cook', skillMin: 4, timeCondition: 'until', timeValue: '14:00', day: 'any' }
    case 'prefer_cost':   return { costDir: 'cheaper' }
    case 'prefer_staff':  return { staffId: '', role: 'any', day: 'any' }
    case 'max_hours':      return { staffId: '', minWeekHours: 0, maxHours: 38 }
    case 'max_role_hours': return { role: 'dishwasher', minRoleHours: 0, maxRoleHours: 8 }
    case 'avoid_day':     return { staffId: '', day: 'Mon' }
    case 'min_shift':     return { minHours: 2, juniorMinHours: 1.5, juniorOnlyIfCheaper: true }
    case 'note':          return { noteText: '' }
  }
}

const DEFAULT_RULES: Rule[] = [
  { id: '1', enabled: true,  type: 'prefer_group',  group: 'school', role: 'any', day: 'any' },
  { id: '2', enabled: true,  type: 'require_skill', role: 'kitchen_cook', skillMin: 4, timeCondition: 'until', timeValue: '14:00', day: 'any' },
  { id: '3', enabled: true,  type: 'prefer_cost',   costDir: 'cheaper' },
  { id: '4', enabled: true,  type: 'require_skill', role: 'barista', skillMin: 4, timeCondition: 'until', timeValue: '12:00', day: 'any' },
  { id: '5', enabled: true,  type: 'min_shift',     minHours: 2, juniorMinHours: 1.5, juniorOnlyIfCheaper: true },
  { id: '6', enabled: true,  type: 'note',          noteText: 'Prefer 5–6 hour shifts. When splitting, the morning segment gets more hours.' },
]

function loadRules(): Rule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES
  try {
    const raw = localStorage.getItem(RULE_STORAGE_KEY)
    if (!raw) return DEFAULT_RULES
    return JSON.parse(raw)
  } catch { return DEFAULT_RULES }
}

// ── Inline field components ──────────────────────────────────────────────────

function Sel({ value, onChange, options, className = '' }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`text-xs border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 ${className}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Num({ value, onChange, min = 1, max = 20, step = 1 }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value) || min)))}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 w-14 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
    />
  )
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
    />
  )
}

// ── Rule fields ──────────────────────────────────────────────────────────────

function RuleFields({ rule, onChange, staff }: {
  rule: Rule
  onChange: (patch: Partial<Rule>) => void
  staff: { id: string; full_name: string }[]
}) {
  const staffOptions = [
    { value: '', label: '— pick staff —' },
    ...staff.map(s => ({ value: s.id, label: s.full_name })),
  ]

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <span className="text-xs text-gray-500">{children}</span>
  )

  switch (rule.type) {
    case 'prefer_group':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lbl>Prefer</Lbl>
          <Sel value={rule.group ?? 'school'} onChange={v => onChange({ group: v as Rule['group'] })}
            options={[{ value: 'school', label: 'school kids' }, { value: 'senior', label: 'senior staff' }]} />
          <Lbl>for</Lbl>
          <Sel value={rule.role ?? 'any'} onChange={v => onChange({ role: v })} options={ROLE_OPTIONS} />
          <Lbl>on</Lbl>
          <Sel value={rule.day ?? 'any'} onChange={v => onChange({ day: v })} options={DAY_OPTIONS} />
        </div>
      )

    case 'require_skill':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lbl>Require skill</Lbl>
          <Sel value={String(rule.skillMin ?? 4)} onChange={v => onChange({ skillMin: parseInt(v) })}
            options={[1,2,3,4,5].map(n => ({ value: String(n), label: `${n}★` }))} />
          <Lbl>+ for</Lbl>
          <Sel value={rule.role ?? 'kitchen_cook'} onChange={v => onChange({ role: v })} options={ROLE_OPTIONS} />
          <Sel value={rule.timeCondition ?? 'until'} onChange={v => onChange({ timeCondition: v as Rule['timeCondition'] })}
            options={[{ value: 'any', label: 'any time' }, { value: 'until', label: 'until' }, { value: 'from', label: 'from' }]} />
          {rule.timeCondition !== 'any' && (
            <TimeInput value={rule.timeValue ?? '14:00'} onChange={v => onChange({ timeValue: v })} />
          )}
        </div>
      )

    case 'prefer_cost':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lbl>Prefer</Lbl>
          <Sel value={rule.costDir ?? 'cheaper'} onChange={v => onChange({ costDir: v as Rule['costDir'] })}
            options={[{ value: 'cheaper', label: 'cheaper staff' }, { value: 'pricier', label: 'senior (higher paid) staff' }]} />
          <Lbl>when skill levels are equal</Lbl>
        </div>
      )

    case 'prefer_staff':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lbl>Prefer</Lbl>
          <Sel value={rule.staffId ?? ''} onChange={v => onChange({ staffId: v })} options={staffOptions} />
          <Lbl>for</Lbl>
          <Sel value={rule.role ?? 'any'} onChange={v => onChange({ role: v })} options={ROLE_OPTIONS} />
          <Lbl>on</Lbl>
          <Sel value={rule.day ?? 'any'} onChange={v => onChange({ day: v })} options={DAY_OPTIONS} />
        </div>
      )

    case 'max_hours':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Sel value={rule.staffId ?? ''} onChange={v => onChange({ staffId: v })} options={staffOptions} />
          <Lbl>min</Lbl>
          <Num value={rule.minWeekHours ?? 0} onChange={v => onChange({ minWeekHours: v })} min={0} max={60} step={0.5} />
          <Lbl>h / max</Lbl>
          <Num value={rule.maxHours ?? 38} onChange={v => onChange({ maxHours: v })} min={0} max={60} step={0.5} />
          <Lbl>h per week</Lbl>
        </div>
      )

    case 'max_role_hours':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Sel value={rule.role ?? 'dishwasher'} onChange={v => onChange({ role: v })} options={ROLE_OPTIONS.filter(o => o.value !== 'any')} />
          <Lbl>min</Lbl>
          <Num value={rule.minRoleHours ?? 0} onChange={v => onChange({ minRoleHours: v })} min={0} max={24} step={0.5} />
          <Lbl>h / max</Lbl>
          <Num value={rule.maxRoleHours ?? 8} onChange={v => onChange({ maxRoleHours: v })} min={0} max={24} step={0.5} />
          <Lbl>h per day</Lbl>
        </div>
      )

    case 'avoid_day':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lbl>Never assign</Lbl>
          <Sel value={rule.staffId ?? ''} onChange={v => onChange({ staffId: v })} options={staffOptions} />
          <Lbl>on</Lbl>
          <Sel value={rule.day ?? 'Mon'} onChange={v => onChange({ day: v })}
            options={DAY_OPTIONS.filter(d => d.value !== 'any')} />
        </div>
      )

    case 'min_shift':
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <Lbl>Min shift</Lbl>
            <Num value={rule.minHours ?? 2} onChange={v => onChange({ minHours: v })} min={0.5} max={6} step={0.5} />
            <Lbl>h · School kids min</Lbl>
            <Num value={rule.juniorMinHours ?? 1.5} onChange={v => onChange({ juniorMinHours: v })} min={0.5} max={6} step={0.5} />
            <Lbl>h</Lbl>
          </div>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={rule.juniorOnlyIfCheaper ?? true}
              onChange={e => onChange({ juniorOnlyIfCheaper: e.target.checked })}
              className="rounded"
            />
            only assign juniors if cheaper than alternatives
          </label>
        </div>
      )

    case 'note':
      return (
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-xs text-amber-500">📋</span>
          <input
            type="text"
            value={rule.noteText ?? ''}
            onChange={e => onChange({ noteText: e.target.value })}
            placeholder="Type a note or reminder..."
            className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 bg-amber-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
        </div>
      )

    default:
      return null
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RuleBuilder({ staff }: { staff: { id: string; full_name: string }[] }) {
  const [rules, setRules] = useState<Rule[]>(loadRules)
  const [dragging, setDragging] = useState<{ id: string; idx: number } | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(rules))
  }, [rules])

  function addRule() {
    const id = Date.now().toString()
    setRules(r => [...r, { id, enabled: true, type: 'prefer_group', ...defaultForType('prefer_group') }])
  }

  function deleteRule(id: string) {
    setRules(r => r.filter(x => x.id !== id))
  }

  function toggleEnabled(id: string) {
    setRules(r => r.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  }

  function patchRule(id: string, patch: Partial<Rule>) {
    setRules(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  }

  function changeType(id: string, type: RuleType) {
    setRules(r => r.map(x => x.id === id
      ? { id: x.id, enabled: x.enabled, type, ...defaultForType(type) }
      : x
    ))
  }

  // ── Drag to reorder ────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent, id: string, idx: number) => {
    e.preventDefault()
    setDragging({ id, idx })
    setDragOverIdx(idx)

    const move = (ev: MouseEvent) => {
      if (!listRef.current) return
      const rows = listRef.current.querySelectorAll('[data-row]')
      let target = idx
      rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect()
        if (ev.clientY > rect.top + rect.height / 2) target = i + 1
      })
      setDragOverIdx(Math.min(target, rows.length - 1))
    }

    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDragging(null)
      setDragOverIdx(null)

      if (!listRef.current) return
      const rows = listRef.current.querySelectorAll('[data-row]')
      let target = idx
      rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect()
        if (ev.clientY > rect.top + rect.height / 2) target = i + 1
      })
      target = Math.min(target, rows.length - 1)
      if (target === idx) return

      setRules(prev => {
        const next = [...prev]
        const [item] = next.splice(idx, 1)
        next.splice(target > idx ? target - 1 : target, 0, item)
        return next
      })
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  const enabledActionRules = rules.filter(r => r.enabled && r.type !== 'note').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Roster Rules</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rules are applied top-to-bottom when auto-filling the roster. Drag to reorder.
          {enabledActionRules > 0 && (
            <span className="text-indigo-600 ml-1">{enabledActionRules} active rule{enabledActionRules !== 1 ? 's' : ''} affect auto-fill.</span>
          )}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" ref={listRef}>
        {/* Header */}
        <div className="grid grid-cols-[28px_28px_140px_1fr_28px_28px] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div />
          <div className="text-center">#</div>
          <div className="pl-1">Rule type</div>
          <div className="pl-2">Configuration</div>
          <div />
          <div />
        </div>

        {rules.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No rules yet — add one below.
          </div>
        )}

        {rules.map((rule, idx) => {
          const isDraggingThis = dragging?.id === rule.id
          const isDropTarget   = dragOverIdx === idx && dragging?.id !== rule.id
          const isNote         = rule.type === 'note'
          return (
            <div
              key={rule.id}
              data-row
              className={[
                'grid grid-cols-[28px_28px_140px_1fr_28px_28px] gap-0 px-4 py-3 items-center border-b border-gray-100 last:border-b-0',
                isDraggingThis ? 'opacity-40 bg-gray-50' : isNote ? 'bg-amber-50/40' : 'bg-white',
                isDropTarget ? 'border-t-2 border-t-indigo-400' : '',
              ].join(' ')}
            >
              {/* Drag handle */}
              <div
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none flex items-center justify-center text-base"
                onMouseDown={e => onDragStart(e, rule.id, idx)}
                title="Drag to reorder"
              >
                ⠿
              </div>

              {/* Priority */}
              <div className={`text-center text-sm font-semibold ${rule.enabled && !isNote ? 'text-indigo-600' : 'text-gray-300'}`}>
                {rule.enabled && !isNote ? idx + 1 : '–'}
              </div>

              {/* Type selector */}
              <div className="pl-1">
                <select
                  value={rule.type}
                  onChange={e => changeType(rule.id, e.target.value as RuleType)}
                  className={`text-xs border rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 ${
                    isNote
                      ? 'border-amber-200 bg-amber-50 text-amber-700 focus:ring-amber-300'
                      : rule.enabled
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-800 focus:ring-indigo-400'
                        : 'border-gray-200 bg-gray-50 text-gray-400 focus:ring-gray-300'
                  }`}
                >
                  {RULE_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Fields */}
              <div className={`pl-2 ${!rule.enabled && !isNote ? 'opacity-40' : ''}`}>
                <RuleFields rule={rule} onChange={p => patchRule(rule.id, p)} staff={staff} />
              </div>

              {/* Enable toggle (notes don't have meaningful enable/disable) */}
              {!isNote ? (
                <button
                  onClick={() => toggleEnabled(rule.id)}
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${
                    rule.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  ✓
                </button>
              ) : <div />}

              {/* Delete */}
              <button
                onClick={() => deleteRule(rule.id)}
                title="Delete rule"
                className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={addRule}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Add rule
        </button>
        <p className="text-xs text-gray-400">Drag ⠿ to reorder · ✓ to enable/disable</p>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs font-medium text-gray-600 mb-2">Rule types explained</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {RULE_TYPE_OPTIONS.map(o => (
            <div key={o.value} className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{o.label}</span> — {o.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
