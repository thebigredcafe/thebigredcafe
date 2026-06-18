// Scrapes SSFA fixture data from the Livewire PowerGrid table.
// Rows are rendered as wire:key="row-{rowId}-{column}-0" with a <div> value inside.
// Also probes future weeks via Livewire updates (SSFA publishes week-by-week).

interface SsfaFixture {
  date: string      // YYYY-MM-DD
  round: number
  kickoff: string | null  // HH:MM 24h
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

function parseWireRows(html: string, teamLabel: string): SsfaFixture[] {
  const rowIds = [...new Set(
    [...html.matchAll(/wire:key="row-(\d+)-/g)].map(m => m[1])
  )]
  const results: SsfaFixture[] = []

  for (const rowId of rowIds) {
    const col = (column: string) => {
      const esc = column.replace(/\./g, '\\.')
      const regex = new RegExp(`wire:key="row-${rowId}-${esc}-0"[^>]*>[\\s\\S]*?<div[^>]*>([^<]*)<\\/div>`)
      return html.match(regex)?.[1]?.trim() ?? ''
    }

    const home = col('home_team.name.plain')
    const away = col('away_team.name.plain')
    if (!home && !away) continue
    if (!home.includes(teamLabel) && !away.includes(teamLabel)) continue

    const rawDate = col('date')
    const dp = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const date = dp ? `${dp[3]}-${dp[2]}-${dp[1]}` : rawDate

    results.push({
      date,
      round: parseInt(col('round')) || 0,
      kickoff: col('start_time') || null,
      homeTeam: home,
      awayTeam: away,
      venue: col('field.plain'),
      isHome: home.includes(teamLabel),
    })
  }
  return results
}

export async function fetchSsfaFixtures(
  clubId: number,
  ageGroupId: number,
  teamLabel: string,
  weeksAhead = 8
): Promise<SsfaFixture[]> {
  const url = `https://ssfa.mycompapp.com/fixtures?club=${clubId}&age_group=${ageGroupId}`
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
  }

  const res = await fetch(url, { headers, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`SSFA fetch failed: ${res.status}`)

  const cookies = res.headers.getSetCookie?.() ?? []
  const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ')
  const html = await res.text()

  const snapshotStr = html.match(/wire:snapshot="([^"]+)"/)?.[1]
    ?.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'") ?? ''
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ?? ''

  // Collect fixtures keyed by date+round to deduplicate
  const seen = new Set<string>()
  const all: SsfaFixture[] = []

  const addRows = (rows: SsfaFixture[]) => {
    for (const row of rows) {
      const key = `${row.date}:${row.round}:${row.homeTeam}`
      if (!seen.has(key)) { seen.add(key); all.push(row) }
    }
  }

  // Current week from initial HTML
  addRows(parseWireRows(html, teamLabel))

  if (!snapshotStr || !csrf) return all

  // Probe future weeks via Livewire updates
  const today = new Date()
  for (let week = 1; week <= weeksAhead; week++) {
    const d = new Date(today)
    d.setDate(d.getDate() + week * 7)
    const startDate = d.toISOString().split('T')[0]

    try {
      const resp = await fetch('https://ssfa.mycompapp.com/livewire/update', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-Livewire': 'true',
          'X-CSRF-TOKEN': csrf,
          Cookie: cookieHeader,
          Referer: url,
        },
        body: JSON.stringify({
          components: [{ snapshot: snapshotStr, updates: { start_date: startDate }, calls: [] }]
        }),
        next: { revalidate: 0 },
      })
      if (!resp.ok) continue
      const data = await resp.json()
      const weekHtml = data.components?.[0]?.effects?.html ?? ''
      if (weekHtml) addRows(parseWireRows(weekHtml, teamLabel))
    } catch {
      // skip failed weeks
    }
  }

  return all
}
