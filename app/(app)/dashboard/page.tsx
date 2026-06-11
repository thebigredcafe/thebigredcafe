import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const ROLE_LABELS: Record<string, string> = {
  barista: 'Barista',
  customer_service: 'Customer Service / Floor',
  floor_staff: 'Floor Staff',
  kitchen_cook: 'Kitchen',
  kitchen_cook_prep: 'Kitchen / Prep',
  dishwasher: 'Dishes',
  new_staff: 'New Staff',
  split: 'Split Shift',
}

const ROLE_COLORS: Record<string, string> = {
  barista: 'bg-red-100 text-red-800 border-red-200',
  customer_service: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  floor_staff: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  kitchen_cook: 'bg-blue-100 text-blue-800 border-blue-200',
  kitchen_cook_prep: 'bg-blue-100 text-blue-800 border-blue-200',
  dishwasher: 'bg-sky-100 text-sky-800 border-sky-200',
  new_staff: 'bg-green-100 text-green-800 border-green-200',
  split: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const today = new Date().toISOString().split('T')[0]

  const { data: shifts } = await supabase
    .from('roster_shifts')
    .select('*')
    .eq('user_id', user.id)
    .eq('published', true)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(20)

  // Group by week
  const grouped: Record<string, typeof shifts> = {}
  for (const shift of shifts ?? []) {
    const week = getWeekLabel(shift.date)
    if (!grouped[week]) grouped[week] = []
    grouped[week]!.push(shift)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Hi {profile?.full_name?.split(' ')[0]}
      </h1>
      <p className="text-sm text-gray-500 mb-6">Your upcoming shifts</p>

      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(grouped).map(([week, weekShifts]) => (
            <div key={week}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{week}</p>
              <div className="space-y-2">
                {weekShifts!.map(shift => {
                  const hours = calcHours(shift.start_time, shift.end_time)
                  const roleColor = ROLE_COLORS[shift.split_time ? 'split' : (shift.role ?? '')] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                  const roleLabel = shift.split_time
                    ? `${ROLE_LABELS[shift.role] ?? shift.role} → ${ROLE_LABELS[shift.split_role] ?? shift.split_role} from ${formatTime(shift.split_time)}`
                    : (ROLE_LABELS[shift.role] ?? shift.role)

                  return (
                    <div key={shift.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{formatDate(shift.date)}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                          <span className="text-gray-400 ml-2">{hours}h</span>
                        </p>
                        {shift.notes && (
                          <p className="text-xs text-gray-400 mt-1">{shift.notes}</p>
                        )}
                      </div>
                      {shift.role && (
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium shrink-0 ${roleColor}`}>
                          {roleLabel}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No upcoming shifts published yet.</p>
          <p className="text-xs text-gray-400 mt-1">Check back once the manager has published the roster.</p>
        </div>
      )}
    </div>
  )
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function formatTime(time: string) {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 || 12
  return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`
}

function calcHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return ((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2)
}

function getWeekLabel(date: string) {
  const d = new Date(date + 'T00:00:00')
  const day = d.getDay()
  const mon = new Date(d); mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5)
  return `${mon.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${sat.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
}
