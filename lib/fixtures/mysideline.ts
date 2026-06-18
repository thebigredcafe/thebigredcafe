// Scrapes PRL MySideline fixture data from the RSC payload embedded in the page HTML.
// The competition page server-renders a `matches` array inside the __next_f RSC chunks.

interface PrlFixture {
  date: string      // YYYY-MM-DD
  round: number
  kickoff: string | null  // HH:MM 24h, null when not yet published
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

export async function fetchPrlFixtures(
  competitionId: number,
  teamId: number
): Promise<PrlFixture[]> {
  const url = `https://prl.mysideline.com.au/competitions/${competitionId}?filter=fixtures&team=${teamId}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`MySideline fetch failed: ${res.status}`)
  const html = await res.text()

  // Decode all __next_f RSC chunks and join
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map(m => {
    try { return JSON.parse('"' + m[1] + '"') } catch { return m[1] }
  })
  const rsc = chunks.join('')

  // Find and parse the matches array
  const matchesStart = rsc.indexOf('"matches":')
  if (matchesStart === -1) return []

  const slice = rsc.slice(matchesStart + '"matches":'.length)
  let depth = 0, end = 0
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === '[') depth++
    else if (slice[i] === ']') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (!end) return []

  let matches: any[]
  try {
    matches = JSON.parse(slice.slice(0, end))
  } catch {
    return []
  }

  return matches
    .filter(m => m.homeTeam?._id === teamId || m.awayTeam?._id === teamId)
    .map(m => {
      const venueTimezone = m.fullVenue?.venueTimezone ?? m.venue?.venueTimezone ?? 'Australia/Sydney'
      const dt = new Date(m.dateTime)

      // Convert to local date string YYYY-MM-DD
      const date = dt.toLocaleDateString('en-CA', { timeZone: venueTimezone })

      // Convert to HH:MM — treat early-morning times (< 06:00) as unpublished
      const localHour = parseInt(dt.toLocaleString('en-AU', { timeZone: venueTimezone, hour: 'numeric', hour12: false }))
      const kickoff = (m.meta?.isTba || localHour < 6)
        ? null
        : dt.toLocaleTimeString('en-GB', { timeZone: venueTimezone, hour: '2-digit', minute: '2-digit' })

      return {
        date,
        round: m.round?.number ?? 0,
        kickoff,
        homeTeam: m.homeTeam?.name ?? '',
        awayTeam: m.awayTeam?.name ?? '',
        venue: m.fullVenue?.name ?? m.venue?.name ?? '',
        isHome: m.homeTeam?._id === teamId,
      }
    })
}
