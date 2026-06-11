// Fetches fixture data from the PlayHQ public API (no auth required)

interface PlayHQFixture {
  date: string
  round: number
  kickoff: string | null
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

export async function fetchPlayHQFixtures(teamId: string): Promise<PlayHQFixture[]> {
  const url = `https://api.playhq.com/v1/organisations/teams/${teamId}/fixtures`

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-key': '',  // public API — no key needed
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    // Try alternate endpoint
    return fetchPlayHQFixturesAlt(teamId)
  }

  const data = await res.json()
  return parsePlayHQResponse(data, teamId)
}

async function fetchPlayHQFixturesAlt(teamId: string): Promise<PlayHQFixture[]> {
  const url = `https://api.playhq.com/v1/teams/${teamId}/fixtures`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`PlayHQ fetch failed: ${res.status}`)

  const data = await res.json()
  return parsePlayHQResponse(data, teamId)
}

function parsePlayHQResponse(data: any, teamId: string): PlayHQFixture[] {
  const items = data?.data ?? data?.fixtures ?? data ?? []
  if (!Array.isArray(items)) return []

  return items.map((f: any) => ({
    date: f.date ?? f.scheduledTime?.split('T')[0] ?? '',
    round: f.round?.roundNumber ?? f.roundNumber ?? 0,
    kickoff: f.time ?? f.scheduledTime?.split('T')[1]?.slice(0, 5) ?? null,
    homeTeam: f.homeTeam?.name ?? f.home?.teamName ?? '',
    awayTeam: f.awayTeam?.name ?? f.away?.teamName ?? '',
    venue: f.venue?.name ?? f.venueName ?? '',
    isHome: (f.homeTeam?.id ?? f.home?.teamId) === teamId,
  }))
}
