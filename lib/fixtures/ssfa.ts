// Scrapes SSFA fixture data from the Livewire PowerGrid table.
// Rows are rendered as wire:key="row-{rowId}-{column}-0" with a <div> value inside.

interface SsfaFixture {
  date: string      // YYYY-MM-DD
  round: number
  kickoff: string | null  // HH:MM 24h
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

  // Extract all unique row IDs from wire:key="row-{id}-{column}-0"
  const rowIds = [...new Set(
    [...html.matchAll(/wire:key="row-(\d+)-/g)].map(m => m[1])
  )]

  if (rowIds.length === 0) return []

  const fixtures: SsfaFixture[] = []

  for (const rowId of rowIds) {
    const col = (column: string) => {
      const regex = new RegExp(`wire:key="row-${rowId}-${column}-0"[^>]*>[\\s\\S]*?<div[^>]*>([^<]*)<\\/div>`)
      return html.match(regex)?.[1]?.trim() ?? ''
    }

    const home = col('home_team\\.name\\.plain')
    const away = col('away_team\\.name\\.plain')

    // Only keep rows involving this team
    if (!home.includes(teamLabel) && !away.includes(teamLabel)) continue

    // Parse date from DD/MM/YYYY → YYYY-MM-DD
    const rawDate = col('date')
    const dateParts = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const date = dateParts ? `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}` : ''

    const startTime = col('start_time') || null
    const roundVal = col('round')

    fixtures.push({
      date,
      round: parseInt(roundVal) || 0,
      kickoff: startTime,
      homeTeam: home,
      awayTeam: away,
      venue: col('field\\.plain'),
      isHome: home.includes(teamLabel),
    })
  }

  return fixtures
}
