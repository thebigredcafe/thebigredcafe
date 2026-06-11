export type Role =
  | 'barista'
  | 'customer_service'
  | 'floor_staff'
  | 'kitchen_cook'
  | 'kitchen_cook_prep'
  | 'dishwasher'

export const ROLE_LABELS: Record<Role, string> = {
  barista: 'Barista',
  customer_service: 'Customer Service',
  floor_staff: 'Floor Staff',
  kitchen_cook: 'Kitchen Cook',
  kitchen_cook_prep: 'Kitchen Cook/Prep',
  dishwasher: 'Dishwasher',
}

export const ROLES: Role[] = [
  'barista',
  'customer_service',
  'floor_staff',
  'kitchen_cook',
  'kitchen_cook_prep',
  'dishwasher',
]

export type Sport = 'soccer' | 'rugby' | 'netball'

export interface SportTeam {
  id: string
  sport: Sport
  name: string
  ssfa_club_id?: number
  ssfa_age_group_id?: number
  ssfa_label?: string
  prl_competition_id?: number
  prl_team_id?: number
  playhq_team_id?: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: 'staff' | 'manager'
  phone?: string
  hourly_rate?: number
  employment_type?: 'casual' | 'part_time' | 'full_time'
  min_hours_week?: number
  max_hours_week?: number
  sport_team_id?: string
  sport_team?: SportTeam
}

export interface StaffRole {
  id: string
  user_id: string
  role: Role
  skill_level: number
}

export interface FixtureCache {
  id: string
  team_id: string
  date: string
  round?: number
  kickoff?: string
  home_team?: string
  away_team?: string
  venue?: string
  is_home: boolean
  fetched_at: string
}

export interface Availability {
  id: string
  user_id: string
  day_of_week: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  start_time: string
  end_time: string
  note?: string
}

export interface Unavailability {
  id: string
  user_id: string
  date: string
  reason?: string
  all_day: boolean
  start_time?: string
  end_time?: string
}

export interface AvailabilityChange {
  id: string
  user_id: string
  effective_from: string
  effective_to?: string
  day_of_week: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  start_time?: string
  end_time?: string
  unavailable: boolean
  note?: string
}

export interface Shift {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
  role?: string
  notes?: string
  published: boolean
  profile?: Profile
}
