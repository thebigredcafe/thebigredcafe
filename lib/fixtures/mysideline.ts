// Scrapes fixture data from MySideline (PRL rugby league)
// The page is server-rendered with competition data

import * as cheerio from 'cheerio'

interface PrlFixture {
  date: string
  round: number
  kickoff: string | null
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

export async function fetchPrlFixtures(
  competitionId: number,
  teamId: number,
  teamName: string
): Promise<PrlFixture[]> {
  const url = `https://prl.mysideline.com.au/competitions/${competitionId}?filter=teams&team=${teamId}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`MySideline fetch failed: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const fixtures: PrlFixture[] = []

  // Try to find embedded JSON data
  $('script[type="application/json"], script[id*="data"], script[id*="fixture"]').each((_, el) => {
    try {
      const text = $(el).text().trim()
      if (!text) return
      const data = JSON.parse(text)
      const items = data?.fixtures ?? data?.data?.fixtures ?? data?.games ?? []
      for (const f of items) {
        fixtures.push({
          date: f.date ?? f.matchDate ?? '',
          round: f.round ?? f.roundNumber ?? 0,
          kickoff: f.kickoff ?? f.time ?? null,
          homeTeam: f.homeTeam ?? f.home ?? '',
          awayTeam: f.awayTeam ?? f.away ?? '',
          venue: f.venue ?? f.ground ?? '',
          isHome: (f.homeTeam ?? f.home ?? '').toLowerCase().includes(
            teamName.toLowerCase().split(' ')[0]
          ),
        })
      }
    } catch {
      // skip
    }
  })

  // Try to find base64-encoded data (same pattern as SSFA)
  if (fixtures.length === 0) {
    const b64Regex = /data-page="([A-Za-z0-9+/=]{100,})"/g
    let match: RegExpExecArray | null
    while ((match = b64Regex.exec(html)) !== null) {
      try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
        const data = JSON.parse(decoded)
        const items = data?.fixtures ?? data?.games ?? []
        for (const f of items) {
          fixtures.push({
            date: f.date ?? f.fixture_date ?? '',
            round: f.round ?? f.round_number ?? 0,
            kickoff: f.kickoff ?? f.kickoff_time ?? null,
            homeTeam: f.homeTeam ?? f.home_team_name ?? '',
            awayTeam: f.awayTeam ?? f.away_team_name ?? '',
            venue: f.venue ?? f.venue_name ?? '',
            isHome: false,
          })
        }
      } catch {
        // skip
      }
    }
  }

  return fixtures
}
