// Fetches netball fixture data from the PlayHQ public GraphQL API.
// The API requires a `tenant` header (e.g. "netball-australia") derived from
// the team's org page URL. No auth key is needed for public fixture data.

interface PlayHQFixture {
  date: string
  round: number
  kickoff: string | null
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

const PLAYHQ_GQL = 'https://api.playhq.com/graphql'

async function gql(query: string, variables: Record<string, unknown>, tenant: string): Promise<any> {
  const res = await fetch(PLAYHQ_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Origin: 'https://www.playhq.com',
      Referer: `https://www.playhq.com/${tenant}/`,
      tenant,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 0 },
  })
  return res.json()
}

export async function fetchPlayHQFixtures(teamId: string, tenant = 'netball-australia'): Promise<PlayHQFixture[]> {
  // Step 1: resolve the team's gradeID
  const teamRes = await gql(
    `query { discoverTeam(teamID: $teamID) { grade { id } } }`.replace('$teamID', JSON.stringify(teamId)),
    {},
    tenant,
  )
  const gradeId = teamRes.data?.discoverTeam?.grade?.id
  if (!gradeId) throw new Error(`PlayHQ: could not resolve gradeID for team ${teamId}`)

  // Step 2: fetch all rounds for the grade (returns array of rounds with all games)
  const fixtureRes = await gql(`
    query gradeAllRounds($gradeID: ID!) {
      discoverGradeFixture(gradeID: $gradeID) {
        name
        games {
          date
          home { __typename ... on DiscoverTeam { id name } }
          away { __typename ... on DiscoverTeam { id name } }
          allocation {
            time
            dateTimeList { date time }
            court { venue { name } }
          }
          status { value }
        }
      }
    }
  `, { gradeID: gradeId }, tenant)

  const rounds: any[] = fixtureRes.data?.discoverGradeFixture ?? []

  const fixtures: PlayHQFixture[] = []
  for (const round of rounds) {
    const roundNum = parseInt(round.name?.match(/(\d+)/)?.[1] ?? '0')
    const game = (round.games ?? []).find(
      (g: any) => g.home?.id === teamId || g.away?.id === teamId
    )
    if (!game) continue

    const alloc = game.allocation
    const date = alloc?.dateTimeList?.[0]?.date ?? game.date ?? ''
    const rawTime: string | null = alloc?.dateTimeList?.[0]?.time ?? alloc?.time ?? null

    // Treat midnight (00:00:00) as unpublished; real games start at 08:00+
    const kickoff = rawTime && rawTime !== '00:00:00'
      ? rawTime.slice(0, 5)
      : null

    const isHome = game.home?.id === teamId
    fixtures.push({
      date,
      round: roundNum,
      kickoff,
      homeTeam: game.home?.name ?? '',
      awayTeam: game.away?.name ?? '',
      venue: alloc?.court?.venue?.name ?? '',
      isHome,
    })
  }

  return fixtures
}
