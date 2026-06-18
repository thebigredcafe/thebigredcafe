import { createClient } from '@/lib/supabase/server'
import { fetchSsfaFixtures } from '@/lib/fixtures/ssfa'
import { fetchPrlFixtures } from '@/lib/fixtures/mysideline'
import { fetchPlayHQFixtures } from '@/lib/fixtures/playhq'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: teams, error } = await supabase
    .from('sport_teams')
    .select('*')

  if (error || !teams) {
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }

  const results: { teamId: string; fetched: number; error?: string }[] = []

  for (const team of teams) {
    try {
      let fixtures: { date: string; round: number; kickoff: string | null; homeTeam: string; awayTeam: string; venue: string; isHome: boolean }[] = []

      if (team.sport === 'soccer' && team.ssfa_club_id) {
        fixtures = await fetchSsfaFixtures(team.ssfa_club_id, team.ssfa_age_group_id, team.ssfa_label ?? '')
      } else if (team.sport === 'rugby' && team.prl_competition_id) {
        fixtures = await fetchPrlFixtures(team.prl_competition_id, team.prl_team_id)
      } else if (team.sport === 'netball' && team.playhq_team_id) {
        fixtures = await fetchPlayHQFixtures(team.playhq_team_id)
      }

      if (fixtures.length > 0) {
        const rows = fixtures.map(f => ({
          team_id: team.id,
          date: f.date,
          round: f.round || null,
          kickoff: f.kickoff || null,
          home_team: f.homeTeam || null,
          away_team: f.awayTeam || null,
          venue: f.venue || null,
          is_home: f.isHome,
          fetched_at: new Date().toISOString(),
        }))

        await supabase
          .from('fixture_cache')
          .upsert(rows, { onConflict: 'team_id,date,round' })
      }

      results.push({ teamId: team.id, fetched: fixtures.length })
    } catch (err) {
      results.push({ teamId: team.id, fetched: 0, error: String(err) })
    }
  }

  return NextResponse.json({ results, refreshed: new Date().toISOString() })
}
