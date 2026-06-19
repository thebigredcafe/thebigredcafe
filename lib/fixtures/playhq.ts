// PlayHQ fixture derivation via rotation pattern.
// The PlayHQ GraphQL API requires auth, so we derive game times from the
// known round rotation (each round the court time slot increments by a fixed interval).

interface PlayHQFixture {
  date: string       // YYYY-MM-DD
  round: number
  kickoff: string | null
  homeTeam: string
  awayTeam: string
  venue: string
  isHome: boolean
}

// Rotation config keyed by playhq_team_id.
// anchorRound/anchorDate/anchorKickoff: a confirmed round we know.
// intervalMinutes: how much the start time shifts per round.
// numSlots: how many distinct time slots before the rotation repeats.
// totalRounds: full season length.
// venue: where games are played.
const ROTATION_CONFIG: Record<string, {
  anchorRound: number
  anchorDate: string   // YYYY-MM-DD (must be a Saturday)
  anchorKickoff: string // HH:MM 24h
  intervalMinutes: number
  numSlots: number
  totalRounds: number
  venue: string
}> = {
  // SYLVANIA 26W JNR 17 GREEN — Winter 2026
  // Confirmed from draw: R9=09:15, R10=10:30, R11=11:45 (+75min each)
  '8e08606d': {
    anchorRound: 9,
    anchorDate: '2026-06-13',
    anchorKickoff: '09:15',
    intervalMinutes: 75,
    numSlots: 6,         // 09:15 → 10:30 → 11:45 → 13:00 → 14:15 → 15:30 → repeat
    totalRounds: 16,
    venue: 'Bellingara Netball Courts',
  },
}

function deriveFixtures(teamId: string): PlayHQFixture[] {
  const cfg = ROTATION_CONFIG[teamId]
  if (!cfg) return []

  const { anchorRound, anchorDate, anchorKickoff, intervalMinutes, numSlots, totalRounds, venue } = cfg

  const anchorMs = new Date(anchorDate + 'T00:00:00+10:00').getTime()
  const [anchorH, anchorM] = anchorKickoff.split(':').map(Number)
  const anchorBaseMinutes = anchorH * 60 + anchorM

  const fixtures: PlayHQFixture[] = []

  for (let round = 1; round <= totalRounds; round++) {
    const diffRounds = round - anchorRound
    const dateMs = anchorMs + diffRounds * 7 * 24 * 60 * 60 * 1000
    // Format as AEST date
    const date = new Date(dateMs).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })

    // Slot index wraps with numSlots to produce the rotation
    const slotIndex = ((diffRounds % numSlots) + numSlots) % numSlots
    const kickoffMinutes = anchorBaseMinutes + slotIndex * intervalMinutes
    const h = Math.floor(kickoffMinutes / 60)
    const m = kickoffMinutes % 60
    const kickoff = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

    fixtures.push({ date, round, kickoff, homeTeam: '', awayTeam: '', venue, isHome: false })
  }

  return fixtures
}

export async function fetchPlayHQFixtures(teamId: string): Promise<PlayHQFixture[]> {
  return deriveFixtures(teamId)
}
