// Scrapes fixture data from SSFA mycompapp
// The page embeds base64-encoded JSON in script tags

interface SsfaFixture {
  date: string
  round: number
  kickoff: string | null
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

export async function fetchSsfaFixtures(
  clubId: number,
  ageGroupId: number,
  teamLabel: string
): Promise<SsfaFixture[]> {
  const url = `https://ssfa.mycompapp.com/fixtures?club=${clubId}&age_group=${ageGroupId}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`SSFA fetch failed: ${res.status}`)

  const html = await res.text()

  // Extract base64-encoded JSON blobs from the page
  const fixtures: SsfaFixture[] = []
  const b64Regex = /data-page="([A-Za-z0-9+/=]+)"/g
  let match: RegExpExecArray | null

  while ((match = b64Regex.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
      const data = JSON.parse(decoded)
      if (data?.fixtures) {
        for (const f of data.fixtures) {
          const teamInvolved =
            f.home_team_name?.includes(teamLabel) ||
            f.away_team_name?.includes(teamLabel)
          if (!teamInvolved) continue

          fixtures.push({
            date: f.fixture_date,
            round: f.round_number ?? 0,
            kickoff: f.kickoff_time ?? null,
            homeTeam: f.home_team_name ?? '',
            awayTeam: f.away_team_name ?? '',
            venue: f.venue_name ?? '',
            isHome: f.home_team_name?.includes(teamLabel) ?? false,
          })
        }
      }
    } catch {
      // skip non-JSON blobs
    }
  }

  return fixtures
}
