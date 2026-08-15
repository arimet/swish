import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch, saveResult, saveTraining, saveConvocation, savePlay, saveMessage } from '../persistence/repositories'
import type { Convocation, GameEvent, Match, TeamMessage, Period, Player, ReportedResult, ScoreKind, StatKind, Training } from '../domain/types'
import { kindAt } from '../domain/shotzones'
import { newPlay, nextStep } from '../domain/plays'
import type { Side, Arrow, Position, Play, Step, Court, Stroke } from '../domain/plays'
import { CLUB_ID_KEY } from '../app/club'

/**
 * Demo data (DEV only): Avenir de Vignot and its five opponents of the season.
 *
 * The seed only replays when its version has changed, otherwise every opening would
 * overwrite what a developer has just entered by hand. That version used to be a
 * number to bump **from memory**: we therefore assumed that anyone touching the data
 * would remember to raise it. That failed the second time — the distribution of
 * baskets was fixed without the version moving, and browsers already on the old
 * version regenerated nothing. The defect read as a data bug when it was a bug in the
 * guard.
 *
 * `SEED_DATA_VERSION` stays manual for what the fingerprint cannot see (the
 * construction logic, the plays), but the fingerprint of the **declarative tables** is
 * appended to it: touching a player, a weight, a score or a rotation changes the
 * version on its own. See `DATA_FINGERPRINT`, at the very bottom.
 */
const SEED_DATA_VERSION = 'v28'
const LEAGUE = 'Pré régionale masculine · Poule A'

// [name, coach]. The first team is ours; the five that follow are our opponents.
const TEAMS: [string, string][] = [
  ['AVENIR DE VIGNOT', 'FRANZONI Jean Marc'], ['BCV VERDUN', 'WEISSE F.'], ['BC BAR-LE-DUC', 'DURAND M.'],
  ['SLUC NANCY', 'LEROY P.'], ['ÉTOILE DE METZ', 'MOREAU J.'], ['USM SAINT-DIZIER', 'SIMON A.'],
]
/**
 * The real roster, in jersey-number order. Surnames are in capitals, as `TeamCreate`
 * writes them on entry: one convention across the whole application, otherwise the
 * called-up list mixes two spellings.
 *
 * Neither birth date nor height: these are real people, and no personal data about
 * them is invented here. Both fields are optional, and the screens handle their
 * absence — that is in fact the case the old seed exercised with its last player left
 * without data. They are filled in from the team record.
 */
const ROSTER_DATA: [numero: number, name: string, firstName: string][] = [
  [2, 'CAUTENET', 'Louis'],
  [5, 'DELEPEE', 'Mateo'],
  [6, 'SALAH', 'Ali'],
  [7, 'MOUSTACHE-MAYEKO', 'Steeve'],
  [8, 'SALAH', 'Abdellatif'],
  [10, 'MICHEL', 'Felix'],
  [11, 'BUZZI', 'Clement'],
  [13, 'COSSU', 'Etienne'],
  [15, 'NGBAZOUA', 'Yohan'],
  [17, 'HOSTIN', 'Steven'],
  [20, 'MILAS', 'Galaad'],
]

const teamId = (t: number) => `seed-t${t}`
const playerId = (i: number) => `seed-p${i}`

/** Our roster only: the opposition never has players recorded. */
const PLAYERS: Player[] = ROSTER_DATA.map(([number, lastName, firstName], i) => ({
  id: playerId(i), teamId: teamId(0), number, lastName, firstName,
}))
/** The id of the player wearing this number. The seed reasons in jersey numbers —
 *  that is what a coach says — and the index in the array is a storage detail. */
const byJersey = (n: number) => playerId(ROSTER_DATA.findIndex(([num]) => num === n))
const ROSTER = PLAYERS.map((p) => p.id)

let seq = 0
const ev = (e: Omit<GameEvent, 'id' | 'wallClock'> & Record<string, unknown>): GameEvent =>
  ({ ...e, id: `seed-ev-${seq}`, wallClock: seq++ } as GameEvent)

/** Plausible shot spots, **separated by value**.
 *
 *  They used to sit in a single list walked with `k % length`, and the last three —
 *  the three-pointers — were never reached: a game segment counts five baskets, so `k`
 *  never went past index 4. The 3PT column of the match sheet showed zero for the
 *  whole roster, in every game. The seed now picks the shot's **value** first, then a
 *  spot that carries it; `kindAt` remains the sole judge of which side of the line it
 *  falls on, and the seed's test checks that these three spots really are behind
 *  it. */
const SPOTS_2: { x: number; y: number }[] = [
  { x: 0.50, y: 0.14 }, { x: 0.45, y: 0.18 }, { x: 0.56, y: 0.16 }, // in the key
  { x: 0.24, y: 0.24 }, { x: 0.76, y: 0.24 }, { x: 0.50, y: 0.45 }, // mid-range
]
const SPOTS_3: { x: number; y: number }[] = [
  { x: 0.03, y: 0.10 }, { x: 0.97, y: 0.11 }, { x: 0.50, y: 0.68 }, // corners and top
]

/** A player's weight in the distribution of baskets, by jersey number.
 *
 *  These values are **invented**, with one exception: BUZZI is the top scorer because
 *  that is what the club said. The rest is merely plausible and can be corrected from
 *  within the application.
 *
 *  They are deliberately tight. A wider spread does not produce a clearer top scorer,
 *  it produces an aberration: at a weight of 12 against 1, BUZZI took thirty-nine
 *  points a game and five players finished on zero. What makes a match sheet credible
 *  is a ratio of about three between first and last, not a ratio of ten.
 *
 *  The old calculation derived the weight from the rank in the list, which stopped
 *  working once the starters were no longer the first five of the roster. */
const SCORING_WEIGHT: Record<number, number> = {
  11: 6,                       // BUZZI, the top scorer
  13: 4, 2: 4,                 // his two outlets
  15: 3, 17: 2,                // the other two starters
  5: 3, 20: 3, 10: 2, 7: 2, 6: 2, 8: 2, // the bench
}
const jerseyOf = (id: string) => ROSTER_DATA[Number(id.replace('seed-p', ''))]?.[0] ?? 0
const weightFor = (id: string) => SCORING_WEIGHT[jerseyOf(id)] ?? 1

/**
 * Each jersey's role. One label per player, and not a table of weights per category:
 * that is what a coach writes, and it is enough to distribute all the rest of the
 * match sheet. Invented, like `SCORING_WEIGHT`, except for the starting five, which
 * the club gave.
 */
type Role = 'guard' | 'wing' | 'big'
const ROLE_OF: Record<number, Role> = {
  2: 'guard', 5: 'guard',
  11: 'wing', 13: 'wing', 7: 'wing', 10: 'wing', 6: 'wing',
  15: 'big', 17: 'big', 20: 'big', 8: 'big',
}
const roleOf = (id: string): Role => ROLE_OF[jerseyOf(id)] ?? 'wing'

/**
 * What each position produces, by category. The ratios matter more than the values: a
 * guard distributes, a big takes the rebound and blocks, and fouls follow contact — so
 * the big takes slightly more.
 *
 * These weights go through the same allocator as the baskets, by design: it is already
 * what guarantees that a rarely served player ends up being served, and that a
 * substitute does not finish the season on zero rebounds.
 */
const STAT_WEIGHT: Record<StatKind | 'foul', Record<Role, number>> = {
  assist: { guard: 5, wing: 2, big: 1 },
  reb_off: { guard: 1, wing: 2, big: 4 },
  reb_def: { guard: 1, wing: 2, big: 4 },
  block: { guard: 1, wing: 1, big: 5 },
  foul: { guard: 2, wing: 2, big: 3 },
}

/** What one period produces, in team volumes. A full game gives four times as much,
 *  so around thirty rebounds and four blocks: the order of magnitude of a Pré
 *  régionale match sheet. */
const PER_PERIOD: [StatKind, number][] = [['reb_def', 6], ['reb_off', 2], ['block', 1]]

/** Team fouls, period by period. The third exceeds `TEAM_FOUL_BONUS` (five, under
 *  FFBB rules): that is deliberate, the demo must be able to show the "Bonus" pill
 *  without anyone provoking it by hand. */
const FOULS_PER_PERIOD = [3, 4, 5, 4]

/** Nobody fouls out. An excluded player leaves the court, while the seed's rotations
 *  still count them present — the inconsistency would read as a bug in the rules. */
const MAX_FOULS = 4

/**
 * A proportional allocator, by highest quotient: at each award, we serve whoever has
 * the largest `weight / (already served + 1)`.
 *
 * It used to be written by hand inside `baskets` and now serves six things (baskets,
 * assists, two kinds of rebound, blocks, fouls): it is the same question every time,
 * and the three defects that had to be fixed for the baskets — a pre-filled list
 * walked with a modulo, a counter reset on every segment — would have been reproduced
 * identically five more times.
 *
 * The counter is held by the allocator, hence by the game: proportionality plays out
 * over the match and not over a segment of five baskets.
 */
interface Allocator {
  next: (candidates: string[]) => string
  count: (id: string) => number
}
function allocator(weight: (id: string) => number): Allocator {
  const served = new Map<string, number>()
  const count = (id: string) => served.get(id) ?? 0
  const value = (id: string) => weight(id) / (count(id) + 1)
  return {
    count,
    next(candidates) {
      const winner = candidates.reduce((best, id) => (value(id) > value(best) ? id : best))
      served.set(winner, count(winner) + 1)
      return winner
    },
  }
}

/** A game's six allocators. */
type Allocators = Record<'basket' | StatKind | 'foul', Allocator>
const newAllocators = (): Allocators => ({
  basket: allocator(weightFor),
  assist: allocator((id) => STAT_WEIGHT.assist[roleOf(id)]),
  reb_off: allocator((id) => STAT_WEIGHT.reb_off[roleOf(id)]),
  reb_def: allocator((id) => STAT_WEIGHT.reb_def[roleOf(id)]),
  block: allocator((id) => STAT_WEIGHT.block[roleOf(id)]),
  foul: allocator((id) => STAT_WEIGHT.foul[roleOf(id)]),
})

/** Distributes ~`points` as located baskets among the players currently on court
 *  (`onCourtIds`) — never a player who is not — weighted (the first score more), with
 *  a missed shot every three attempts to feed the hot zones. */
function baskets(points: number, clock: () => number, period: Period, onCourtIds: string[], r: Allocators): GameEvent[] {
  /**
   * The decomposition of the total into real shots, and it must come out **exact**:
   * the segment receives a number of points to distribute, and a seed that composes
   * that total from shots of different values without checking the sum makes the
   * scoreboard and the match sheet say two different things.
   *
   * About one three-pointer per nine points scored, so six to eight a game: the order
   * of magnitude of a team that does not build its system on them. The rest in
   * two-pointers, and the odd point as a free throw.
   */
  const n3 = Math.floor(points / 9)
  const nLf = (points - 3 * n3) % 2
  const n2 = (points - 3 * n3 - nLf) / 2
  const shots = n3 + n2

  const out: GameEvent[] = []
  let i2 = 0
  let i3 = 0
  for (let k = 0; k < shots; k++) {
    // The three-pointers **spread** through the segment rather than bunched at the
    // front: a quarter that opens with all its threes looks like nothing on the shot
    // chart. The integer-threshold test is the same as a line-drawing one — it places
    // `n3` marks over `shots` positions, as evenly as integers allow.
    const isThree = Math.floor(((k + 1) * n3) / shots) > Math.floor((k * n3) / shots)
    const shot = isThree ? SPOTS_3[i3++ % SPOTS_3.length] : SPOTS_2[i2++ % SPOTS_2.length]
    const playerId = r.basket.next(onCourtIds)
    out.push(ev({ type: 'SCORE', team: 'A', playerId, kind: kindAt(shot.x, shot.y), shot, period, gameClock: clock() }))

    // An assist on every second basket, credited to a team-mate **on the court** and
    // never to the scorer themselves. Attached to the basket rather than distributed
    // by volume: an assist does not exist without the basket it sets up, and that link
    // is what makes the total plausible without anyone tuning it.
    const passers = onCourtIds.filter((id) => id !== playerId)
    if (k % 2 === 0 && passers.length > 0)
      out.push(ev({ type: 'STAT', team: 'A', playerId: r.assist.next(passers), stat: 'assist', period, gameClock: clock() }))

    if (k % 3 === 2) {
      const missed = SPOTS_2[(i2 + 3) % SPOTS_2.length]
      out.push(ev({ type: 'MISS', team: 'A', playerId, kind: kindAt(missed.x, missed.y), shot: missed, period, gameClock: clock() }))
    }
  }
  // The odd point: a free throw, for whoever the allocator serves next — the player
  // who attacks the rim most is the one sent to the line.
  if (nLf) out.push(ev({ type: 'SCORE', team: 'A', playerId: r.basket.next(onCourtIds), kind: 'lf' as ScoreKind, period, gameClock: clock() }))
  return out
}

/**
 * The rest of the match sheet, period by period: rebounds, blocks and fouls, for the
 * players on the court at that moment only.
 *
 * There was almost none of it: a single statistic per player per period, chosen by the
 * player's **index** in the five — so that a given player always got the same one,
 * that blocks only went to the fourth in the list, and that no foul was ever recorded.
 * Three columns of the match sheet were empty in every game, and the team foul counter
 * stayed at zero from start to finish.
 */
function secondaryStats(clock: () => number, period: Period, onCourtIds: string[], r: Allocators): GameEvent[] {
  const out: GameEvent[] = []
  for (const [stat, howMany] of PER_PERIOD)
    for (let k = 0; k < howMany; k++)
      out.push(ev({ type: 'STAT', team: 'A', playerId: r[stat].next(onCourtIds), stat, period, gameClock: clock() }))

  const fouls = FOULS_PER_PERIOD[(period - 1) % FOULS_PER_PERIOD.length]
  for (let k = 0; k < fouls; k++) {
    // The cap is applied by **removing** the player from the candidates, and not by
    // skipping the event: skipping would cost the team counter a foul, and it has to
    // reach the bonus in the period planned.
    const eligible = onCourtIds.filter((id) => r.foul.count(id) < MAX_FOULS)
    if (eligible.length === 0) break
    const playerId = r.foul.next(eligible)
    out.push(ev({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId }, foulType: 'personal', period, gameClock: clock() }))
  }
  return out
}

/** The opposition's score: team baskets only, with no player named and no shot spot —
 *  the opposition has no roster to break down. */
function opponentBaskets(points: number, clock: () => number, period: Period): GameEvent[] {
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) out.push(ev({ type: 'SCORE', team: 'B', kind: '2int', period, gameClock: clock() }))
  if (points % 2) out.push(ev({ type: 'SCORE', team: 'B', kind: 'lf', period, gameClock: clock() }))
  return out
}

/** The starting five, named by jersey numbers and not by rank in the list: a coach
 *  says "the 2, the 11, the 13, the 15 and the 17". */
const STARTERS = [2, 11, 13, 15, 17].map(byJersey)
/**
 * The rotations, by period: `[jersey out, jersey in]`.
 *
 * The starters **come back**. The previous version took one starter off each period
 * and never called them back: by the end of the game the starting five had a few
 * minutes and their substitutes all the rest, so that the starting point guard
 * finished on eight points and a substitute on fifty-one. A double substitution at a
 * single stoppage is perfectly legal, and it is what allows ten players out of eleven
 * to rotate while keeping the starters the most court time — which `playingTimes`
 * knows how to measure.
 */
const SUB_SWAPS: [number, number][][] = [
  [[2, 5]],                     // the point guard takes a breather
  [[5, 2], [17, 10]],           // he comes back, the big takes one
  [[10, 17], [15, 20]],         // and so on
  [[20, 15], [11, 6], [13, 7]], // last quarter: the wing rotates
]

/** Splits a total into `parts` integers as equal as possible. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const rest = total % parts
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0))
}

/** One period of play: baskets for both teams and secondary stats, with a substitute
 *  coming on at the halfway mark if the period has one — only the players actually on
 *  the court at that moment can score or be credited.
 *  The clock runs down to `stopClock` (0 for a period played in full).
 *  The substitution is placed at the exact middle of the period's time (and not
 *  wherever the number of baskets already elapsed happens to fall): it is that clock
 *  value, not the shot count, that `playingTimes` uses to compute court time. */
function periodEvents(p: Period, pointsA: number, pointsB: number, onCourtBefore: string[], swaps: [number, number][] | undefined, stopClock: number, r: Allocators): { events: GameEvent[]; onCourtAfter: string[] } {
  let c = 600
  const clock = () => (c = Math.max(stopClock, c - 5))
  const half = Math.round(pointsA / 2)
  const events = [...baskets(half, clock, p, onCourtBefore, r)]
  let onCourtAfter = onCourtBefore
  if (swaps?.length) {
    // All of the period's substitutions at the same stoppage, at the exact middle of
    // the time: that clock value is what `playingTimes` reads, not the number of
    // baskets already elapsed.
    c = Math.round((600 + stopClock) / 2)
    for (const [out, into] of swaps) {
      events.push(ev({ type: 'SUBSTITUTION', team: 'A', playerOutId: byJersey(out), playerInId: byJersey(into), period: p, gameClock: c }))
      onCourtAfter = onCourtAfter.map((id) => (id === byJersey(out) ? byJersey(into) : id))
    }
  }
  events.push(
    ...baskets(pointsA - half, clock, p, onCourtAfter, r),
    ...opponentBaskets(pointsB, clock, p),
    ...secondaryStats(clock, p, onCourtAfter, r),
    ev({ type: 'CLOCK_STOP', period: p, gameClock: stopClock }),
  )
  return { events, onCourtAfter }
}

const addDays = (iso: string, delta: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = new Date()
const TODAY_ISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

// The season's five matchdays, anchored on the day the seed runs rather than frozen:
// otherwise the demo becomes invisible as soon as the real date passes a hard-coded
// season (`nextFixture` compares against the real clock, never a simulated one). The
// weekly cadence is unchanged: three matchdays past, one today, one in a week.
const MATCHDAYS = [-21, -14, -7, 0, 7].map((delta) => addDays(TODAY_ISO, delta))

interface Fixture { opponent: number; date: string; time: string; status: 'finished' | 'live' | 'setup'; score: [number, number] }
/**
 * Our five games: three played and won, one live, one upcoming.
 *
 * The scores are written out and not computed by a modulo formula. They have to
 * produce a precise table — Avenir de Vignot on top — and a formula cannot be steered:
 * it gave 2W-1L and a differential of −2.
 *
 * For the live game, `score` is the total aimed at over four periods; only two are
 * played, so the screen shows roughly half of it.
 */
const FIXTURES: Fixture[] = [
  { opponent: 1, date: MATCHDAYS[0], time: '20:30', status: 'finished', score: [78, 71] },
  { opponent: 2, date: MATCHDAYS[1], time: '20:00', status: 'finished', score: [72, 64] },
  { opponent: 3, date: MATCHDAYS[2], time: '18:30', status: 'finished', score: [81, 69] },
  { opponent: 4, date: MATCHDAYS[3], time: '20:30', status: 'live', score: [82, 70] },
  { opponent: 5, date: MATCHDAYS[4], time: '18:30', status: 'setup', score: [0, 0] },
]

const THEMES = ['Défense sur écran', 'Tirs extérieurs', 'Transition rapide', 'Jeu sans ballon', 'Rebond et boxout']

/** Two sessions per game week (the Monday and Wednesday before the Saturday game), so
 *  that the calendar and the "next fixture" block have something to show without
 *  anyone entering anything. Exception for the very last matchday — the one carrying
 *  the demo call-up (`buildConvocation`): its two sessions are placed AFTER the game
 *  rather than before. Without that, being closer in time than the game called up,
 *  they would become the next fixture right after a seed, and the "called up, meeting
 *  point, names" block — the whole reason this demo call-up exists — would stay
 *  invisible for days. */
function buildTrainings(): Training[] {
  return FIXTURES.flatMap((f, idx) => {
    const isLastMatchday = idx === FIXTURES.length - 1
    const [d0, d1] = isLastMatchday ? [3, 5] : [-5, -3]
    return [
      // Only the last matchday's sessions are still ahead: so it is the first of them
      // that carries the demo plays, giving the dashboard something to announce under
      // "on the programme" without anyone entering anything.
      { id: `seed-tr${idx}-0`, clubId: teamId(0), date: addDays(f.date, d0), time: '19:00', place: 'Gymnase de Vignot', theme: THEMES[idx % THEMES.length], playIds: isLastMatchday ? ['seed-sch0', 'seed-sch1'] : undefined },
      { id: `seed-tr${idx}-1`, clubId: teamId(0), date: addDays(f.date, d1), time: '19:00', place: 'Gymnase de Vignot', theme: THEMES[(idx + 1) % THEMES.length] },
    ]
  })
}

/** A full call-up on the "upcoming" game (status `setup`), never on a game already
 *  played: it is the one the dashboard's "next fixture" block must find filled in
 *  without anyone entering anything. */
function buildConvocation(): Convocation {
  const idx = FIXTURES.findIndex((f) => f.status === 'setup')
  return {
    matchId: `seed-m${idx}`,
    playerIds: ROSTER,
    meetTime: '17:30',
    meetPlace: 'Gymnase de Vignot',
    note: 'Tenue blanche, covoiturage depuis le club à 17h.',
  }
}

function buildMatch(f: Fixture, idx: number): Match {
  seq = idx * 1000
  const [sa, sb] = f.score
  const qA = splitEvenly(sa, 4)
  const qB = splitEvenly(sb, 4)

  let events: GameEvent[] = []
  if (f.status !== 'setup') {
    // The four periods for a finished game. For a live game we stop in the middle of
    // the second rather than at its end: the game has to stay in progress, not already
    // played.
    const lastPeriod = f.status === 'live' ? 2 : 4
    const lastClock = f.status === 'live' ? 300 : 0

    events.push(
      ev({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'A', playerIds: STARTERS, period: 1, gameClock: 600 }),
      ev({ type: 'CLOCK_START', period: 1, gameClock: 600 }),
    )
    // The allocators are created here, hence owned by the game: proportionality plays
    // out over the match, not over each segment of five baskets.
    const r = newAllocators()
    let onCourt: string[] = STARTERS
    for (let p = 1; p <= lastPeriod; p++) {
      const isLast = p === lastPeriod
      const stopClock = isLast ? lastClock : 0
      const { events: periodEvs, onCourtAfter } = periodEvents(p, qA[p - 1], qB[p - 1], onCourt, SUB_SWAPS[p - 1], stopClock, r)
      events.push(...periodEvs)
      onCourt = onCourtAfter
      if (!isLast) {
        events.push(
          ev({ type: 'PERIOD_END', period: p, gameClock: 0 }),
          ev({ type: 'PERIOD_START', period: p + 1, gameClock: 600 }),
          ev({ type: 'CLOCK_START', period: p + 1, gameClock: 600 }),
        )
      } else if (f.status === 'finished') {
        events.push(ev({ type: 'PERIOD_END', period: p, gameClock: 0 }))
      }
    }
  }

  return {
    id: `seed-m${idx}`,
    meta: {
      championshipLabel: LEAGUE, matchNumber: String(idx + 1), date: f.date, time: f.time,
      venue: idx % 2 === 0 ? 'Vignot' : TEAMS[f.opponent][0].split(' ').pop(), coachA: TEAMS[0][1],
      referee1: 'BART S', referee2: 'WEISSE F', clubId: teamId(0), opponentId: teamId(f.opponent),
    },
    roster: ROSTER,
    events,
    status: f.status,
  }
}

// Fixtures between our five opponents (never our club: our own games are already
// authoritative, and a duplicate would be ignored by the standings). A full round
// among the pool's six teams: on every matchday where we play one of the five, the
// other four split into two games — so that each opponent faces, over the season, the
// other four in addition to us. The dates reuse those of our FIXTURES (`MATCHDAYS`):
// same pool, same matchdays.
interface OutsideGame { home: number; away: number; date: string; score: [number, number] }
/**
 * The fixtures between our five opponents, on the **three matchdays played** only —
 * never today's, never the next.
 *
 * This is what made the standings incoherent: the seed published the results of all
 * five matchdays, so that the other teams showed four or five games while we had
 * three. But FFBB standings count absolute points (W=2, L=1): at three games we cap at
 * six points, while a team with five games has at least five and up to ten. Being top
 * was arithmetically impossible. And publishing the current matchday's results is not
 * what happens in a league anyway.
 *
 * Each therefore plays three games, like us. The scores are chosen so that nobody
 * reaches our six points: `standings.test.ts` and the seed's test check the resulting
 * table.
 */
const OUTSIDE_GAMES: OutsideGame[] = [
  { home: 2, away: 3, date: MATCHDAYS[0], score: [74, 68] },
  { home: 4, away: 5, date: MATCHDAYS[0], score: [80, 72] },
  { home: 1, away: 4, date: MATCHDAYS[1], score: [77, 70] },
  { home: 3, away: 5, date: MATCHDAYS[1], score: [65, 73] },
  { home: 1, away: 5, date: MATCHDAYS[2], score: [82, 75] },
  { home: 2, away: 4, date: MATCHDAYS[2], score: [69, 76] },
]

function buildResult(g: OutsideGame, idx: number): ReportedResult {
  const [homeScore, awayScore] = g.score
  return {
    id: `seed-r${idx}`, championshipLabel: LEAGUE, date: g.date,
    homeId: teamId(g.home), awayId: teamId(g.away), homeScore, awayScore,
  }
}

// ── The demo plays ───────────────────────────────────────────────────────────
// Built with the domain (`newPlay`, `nextStep`) and not copied from a frozen JSON: a
// JSON drifts out of step with the model at the first change. Normalised coordinates,
// with the attacked basket's baseline at y = 0; on a full court everything is halved
// (the front court is y ≤ 0.5).

/** A marker moved at this step: side, position, then its new place. */
type Move = [Side, Position, number, number]

/** An arrow, written the way it reads: who, which stroke, where it goes. */
const fl = (position: Position, stroke: Stroke, points: [number, number][]): Arrow =>
  ({ from: { side: 'offense', position }, stroke, points: points.map(([x, y]) => ({ x, y })) })

/** One step of the demo: what moves, whose the ball is, what gets drawn. */
interface DemoStep { move?: Move[]; ball?: Step['ball']; arrows?: Arrow[] }

/**
 * A demo play: we start from the domain's setup, then each step inherits the previous
 * one (`nextStep`: positions and ball, never the arrows) and writes only what changes.
 * A step's arrows lead where the markers are at the following step — otherwise the
 * coach reads a play that does not play out.
 */
function demoPlay(
  idx: number, clubId: string, name: string, note: string, folder: string,
  court: Court, defense: boolean, script: DemoStep[],
): Play {
  const base = newPlay(clubId, court, defense)
  let t = base.steps[0]
  const steps = script.map((e, i) => {
    t = i === 0 ? t : nextStep(t)
    for (const [side, position, x, y] of e.move ?? []) {
      const marker = t.markers.find((p) => p.side === side && p.position === position)
      if (marker) marker.at = { x, y }
    }
    if (e.ball) t.ball = e.ball
    t.arrows = e.arrows ?? []
    return t
  })
  return { ...base, id: `seed-sch${idx}`, name, note, folder, steps }
}

function buildSchemas(clubId: string): Play[] {
  return [
    // The classic from the top: the 5 comes up to set the screen, the 1 turns around
    // it on the outside, the 5 dives behind their defender and receives.
    demoPlay(0, clubId, 'Pick and roll haut', 'Écran du 5 au sommet, le 1 tourne autour, passe au 5 qui plonge.', 'Attaque placée', 'half', true, [
      {
        move: [
          ['offense', 1, 0.50, 0.66], ['offense', 2, 0.05, 0.16], ['offense', 3, 0.95, 0.16],
          ['offense', 4, 0.16, 0.46], ['offense', 5, 0.68, 0.38],
          ['defense', 1, 0.50, 0.55], ['defense', 2, 0.15, 0.16], ['defense', 3, 0.85, 0.16],
          ['defense', 4, 0.24, 0.40], ['defense', 5, 0.63, 0.32],
        ],
        arrows: [fl(5, 'screen', [[0.68, 0.38], [0.63, 0.52], [0.585, 0.625]])],
      },
      {
        // The screen is set against the ball handler's right shoulder; the 5's
        // defender drops to the level of the key (they do not hedge), the 1's stays on
        // their feet.
        move: [['offense', 5, 0.585, 0.625], ['defense', 5, 0.635, 0.495], ['defense', 1, 0.50, 0.56]],
        arrows: [fl(1, 'dribble', [[0.50, 0.66], [0.60, 0.685], [0.685, 0.575], [0.70, 0.44]])],
      },
      {
        // The 1 has come out on the right side, their defender chasing; the 5's stayed
        // high, and the lane for the dive is open.
        move: [['offense', 1, 0.70, 0.44], ['defense', 1, 0.73, 0.57], ['defense', 5, 0.60, 0.52]],
        arrows: [
          fl(5, 'cut', [[0.585, 0.625], [0.55, 0.42], [0.52, 0.21]]),
          fl(1, 'pass', [[0.70, 0.44], [0.63, 0.34], [0.555, 0.255]]),
        ],
      },
      {
        // The finish, played rather than merely drawn: the 5 arrives at the end of
        // their cut (where the previous step's arrow led) and receives the pass. Their
        // defender, left high on the screen, does not catch them; the 1's stays glued
        // to the handler who has just released the ball.
        move: [['offense', 5, 0.52, 0.21], ['defense', 5, 0.565, 0.37], ['defense', 1, 0.71, 0.51]],
        ball: { side: 'offense', position: 5 },
      },
    ]),

    // A swing from one side to the other: the 4 comes out of the low post to take the
    // corner, and the ball arrives there through the wing.
    demoPlay(1, clubId, 'Corner pour le 4', 'Le 4 sort du poste bas vers le corner, le ballon suit par l’aile.', 'Attaque placée', 'half', false, [
      {
        move: [
          ['offense', 1, 0.50, 0.64], ['offense', 2, 0.82, 0.46], ['offense', 3, 0.18, 0.46],
          ['offense', 4, 0.31, 0.21], ['offense', 5, 0.66, 0.36],
        ],
        arrows: [
          fl(1, 'pass', [[0.50, 0.64], [0.34, 0.55], [0.19, 0.47]]),
          fl(4, 'cut', [[0.31, 0.21], [0.22, 0.15], [0.06, 0.135]]),
        ],
      },
      {
        // The ball has changed hands: it is the 3 who feeds the corner, and the 5
        // crosses the key for the rebound on the shooting side.
        move: [['offense', 4, 0.06, 0.135]],
        ball: { side: 'offense', position: 3 },
        arrows: [
          fl(3, 'pass', [[0.18, 0.46], [0.10, 0.30], [0.065, 0.17]]),
          fl(5, 'cut', [[0.66, 0.36], [0.60, 0.22], [0.44, 0.17]]),
        ],
      },
    ]),

    // A box inbound, on a full court: the inbounder is behind the baseline and the
    // ball waits on the floor until the referee hands it over.
    demoPlay(2, clubId, 'Remise ligne de fond', 'Boîte à quatre : écran du 5, le 3 coupe au panier, le 4 assure derrière.', 'Remises en jeu', 'full', false, [
      {
        move: [
          ['offense', 1, 0.62, 0.025], ['offense', 2, 0.36, 0.20], ['offense', 3, 0.64, 0.20],
          ['offense', 4, 0.64, 0.09], ['offense', 5, 0.36, 0.09],
        ],
        // The ball waits on the floor, away from the inbounder: set on the line, it
        // must not read as a ball already in hand.
        ball: { x: 0.82, y: 0.035 },
        arrows: [
          fl(5, 'screen', [[0.36, 0.09], [0.47, 0.13], [0.565, 0.165]]),
          fl(3, 'cut', [[0.64, 0.20], [0.585, 0.135], [0.50, 0.09]]),
          fl(2, 'cut', [[0.36, 0.20], [0.20, 0.145], [0.065, 0.085]]),
          // The 4 drops back as safety towards the half-way line: without them, a
          // turnover on the inbound runs alone to the basket. Their cut goes round the
          // 3 on the outside rather than through them.
          fl(4, 'cut', [[0.64, 0.09], [0.73, 0.22], [0.60, 0.41]]),
        ],
      },
      {
        // The ball is in hand: the inbound goes to the 3, coming off the 5's screen.
        move: [['offense', 2, 0.065, 0.085], ['offense', 3, 0.50, 0.09], ['offense', 4, 0.60, 0.41], ['offense', 5, 0.565, 0.165]],
        ball: { side: 'offense', position: 1 },
        arrows: [fl(1, 'pass', [[0.62, 0.025], [0.57, 0.055], [0.505, 0.085]])],
      },
    ]),
  ]
}

/** The coach's message, dated two days ago: the dashboard must show the panel AND its
 *  age without anyone entering anything, and two days stay on the fresh side of the
 *  switch to amber (fifteen days). */
function buildMessage(): TeamMessage {
  return {
    clubId: teamId(0),
    text: 'Pas d’entraînement mardi, le gymnase est fermé. Pensez au maillot blanc pour samedi.',
    writtenAt: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
  }
}

/**
 * A fingerprint of the seed's declarative tables. Any change to the roster, the
 * scoring weights, the starting five, the rotations, our scores or the outside results
 * changes it — and so regenerates the data without anyone having to think about it.
 *
 * **Dates** are excluded on purpose: they are anchored on the day the seed runs, so
 * including them would regenerate everything each night and erase what a developer
 * entered the day before.
 *
 * The hash is a djb2 in base 36: the aim is not to resist a malicious collision, only
 * to notice that a constant has moved.
 */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export const DATA_FINGERPRINT = fingerprint([
  ROSTER_DATA, TEAMS, SCORING_WEIGHT, THEMES,
  ROLE_OF, STAT_WEIGHT, PER_PERIOD, FOULS_PER_PERIOD, MAX_FOULS,
  SPOTS_2, SPOTS_3,
  [2, 11, 13, 15, 17], SUB_SWAPS,
  FIXTURES.map((f) => [f.opponent, f.time, f.status, f.score]),
  OUTSIDE_GAMES.map((g) => [g.home, g.away, g.score]),
])
const SEED_VERSION = `${SEED_DATA_VERSION}-${DATA_FINGERPRINT}`

export async function seedDevData(): Promise<void> {
  const already = (await db.teams.count()) > 0
  if (already && localStorage.getItem('seed-version') === SEED_VERSION) return
  // Re-seed (schema or demo data updated). Call-ups and trainings too: without that, a
  // re-seed would leave orphans attached to games that no longer exist.
  await db.matches.clear(); await db.players.clear(); await db.teams.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear(); await db.messages.clear()

  for (let t = 0; t < TEAMS.length; t++) await saveTeam({ id: teamId(t), name: TEAMS[t][0], coach: TEAMS[t][1] })
  for (const p of PLAYERS) await savePlayer(p)
  for (let idx = 0; idx < FIXTURES.length; idx++) await saveMatch(buildMatch(FIXTURES[idx], idx))
  for (let idx = 0; idx < OUTSIDE_GAMES.length; idx++) await saveResult(buildResult(OUTSIDE_GAMES[idx], idx))
  for (const tr of buildTrainings()) await saveTraining(tr)
  await saveConvocation(buildConvocation())
  await saveMessage(buildMessage())
  for (const s of buildSchemas(teamId(0))) await savePlay(s)

  localStorage.setItem('seed-version', SEED_VERSION)
  // Avenir de Vignot is the demo club: without this, the demo opens on the welcome
  // screen every time the data is regenerated.
  if (!localStorage.getItem(CLUB_ID_KEY)) localStorage.setItem(CLUB_ID_KEY, teamId(0))
}
