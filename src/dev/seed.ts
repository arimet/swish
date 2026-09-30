import type { Kind } from '../persistence/api'
import type { Convocation, GameEvent, Match, TeamMessage, Period, Player, ReportedResult, Training } from '../domain/types'
import { newPlay, nextStep } from '../domain/plays'
import type { Side, Arrow, Position, Play, Step, Court, Stroke } from '../domain/plays'

/**
 * Demo data: Avenir de Vignot - 1 and its real 2026-2027 season in Pré régionale
 * masculine (comité de la Meuse, poule A), as published on competitions.ffbb.com on
 * 30 September 2026 — the pool's eleven teams, our twenty games, and the matchday-1
 * results between the others.
 *
 * **Nothing about a game is invented beyond its score.** The one game already played
 * carries its final score and nothing else: no scorer, no shot, no rebound. It is
 * entered as team baskets with no player named — the shape the application already
 * gives the opposition's score — so the scoreboard, the result and the standings are
 * right, and every player's line stays at zero rather than showing figures nobody
 * recorded. The trainings, the call-up and the coach's message remain inventions: the
 * federation publishes none of them, and the dashboard needs them to show anything.
 *
 * **This module writes nothing.** `seedDocuments` builds the season and hands it
 * over; `scripts/db.mjs seed` is what puts it in the database. The application never
 * seeds itself.
 *
 * To regenerate after touching the data below: `pnpm db:reset`.
 */
const LEAGUE = 'Pré régionale masculine · Poule A'

/** Where Avenir de Vignot plays at home, as the federation names it. Away venues are
 *  not published on the team's calendar, so away games carry none. */
const HOME_VENUE = 'SALLE POLYVALENTE DES OUILLONS'

// [name, coach]. The first team is ours. The other clubs' coaches are not published,
// and no name is invented for real people: they are left empty.
const TEAMS: [string, string | undefined][] = [
  ['AVENIR DE VIGNOT - 1', 'FRANZONI Jean Marc'],
  ['BCV VERDUN', undefined],
  ['ASC CHARNY SUR MEUSE - 2', undefined],
  ['ASC CHARNY SUR MEUSE - 3', undefined],
  ['ASC CHARNY SUR MEUSE - 4', undefined],
  ['CSLB BAR LE DUC - 1', undefined],
  ['CSLB BAR LE DUC - 2', undefined],
  ["L'ESPERANCE DE STENAY", undefined],
  ['AS SOUILLY-BASKET', undefined],
  ['PAGNY SUR MEUSE BC', undefined],
  ['AVENIR DE VIGNOT - 2', undefined],
]
const [VERDUN, CHARNY_2, CHARNY_3, CHARNY_4, BAR_1, BAR_2, STENAY, SOUILLY, PAGNY, VIGNOT_2] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * The real roster, in jersey-number order. Surnames are in capitals, as `TeamCreate`
 * writes them on entry: one convention across the whole application, otherwise the
 * called-up list mixes two spellings.
 *
 * Neither birth date nor height: these are real people, and no personal data about
 * them is invented here. Both fields are optional, and the screens handle their
 * absence. They are filled in from the team record.
 */
const ROSTER_DATA: [jersey: number, name: string, firstName: string][] = [
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

/** A document as the seed hands it over: its kind, the key it is filed under, and
 *  the document itself. The key is not always `doc.id` — see `seedDocuments`. */
export interface SeedDoc { kind: Kind; id: string; doc: unknown }

const teamId = (t: number) => `seed-t${t}`
const playerId = (i: number) => `seed-p${i}`

/** Our roster only: the opposition never has players recorded. */
const PLAYERS: Player[] = ROSTER_DATA.map(([number, lastName, firstName], i) => ({
  id: playerId(i), teamId: teamId(0), number, lastName, firstName,
}))
const ROSTER = PLAYERS.map((p) => p.id)
/** The id of the player wearing this number: a coach names a five by jerseys. */
const byJersey = (n: number) => playerId(ROSTER_DATA.findIndex(([num]) => num === n))
/** The starting five the club named: the 2, the 11, the 13, the 15 and the 17. */
const STARTERS = [2, 11, 13, 15, 17].map(byJersey)

let seq = 0
const ev = (e: Omit<GameEvent, 'id' | 'wallClock'> & Record<string, unknown>): GameEvent =>
  ({ ...e, id: `seed-ev-${seq}`, wallClock: seq++ } as GameEvent)

/** Splits a total into `parts` integers as equal as possible. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const rest = total % parts
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0))
}

/**
 * A final score as events, and nothing more: two-point team baskets and the odd point
 * as a free throw, with no player named and no shot spot.
 *
 * Spread over four periods, because a sheet whose seventy points all fall in the first
 * quarter reads as a bug on the period-by-period line. The split is even, not
 * observed — the federation's page gives the final score only.
 */
function scoreOnly(team: 'A' | 'B', points: number, period: Period): GameEvent[] {
  const out: GameEvent[] = []
  for (let k = 0; k < Math.floor(points / 2); k++) out.push(ev({ type: 'SCORE', team, kind: '2int', period, gameClock: 300 }))
  if (points % 2) out.push(ev({ type: 'SCORE', team, kind: 'lf', period, gameClock: 300 }))
  return out
}

interface Fixture {
  /** The federation's matchday. Vignot 1 sits out matchdays 6 and 17. */
  day: number
  /** The federation's game number (`#1`, `#7`…). */
  number: number
  date: string
  time: string
  home: boolean
  opponent: number
  /** Our points, theirs — only for a game already played. */
  score?: [number, number]
  /** The game the demo shows in progress, so the scorer's table and the spectator view
   *  have something to open. */
  live?: true
}
/** The twenty games of the season, from the team's calendar on competitions.ffbb.com. */
const FIXTURES: Fixture[] = [
  { day: 1, number: 1, date: '2026-09-27', time: '15:30', home: true, opponent: VERDUN, score: [70, 62] },
  { day: 2, number: 7, date: '2026-10-03', time: '20:30', home: false, opponent: CHARNY_2, live: true },
  { day: 3, number: 13, date: '2026-10-11', time: '15:30', home: true, opponent: CHARNY_3 },
  { day: 4, number: 19, date: '2026-11-08', time: '13:30', home: false, opponent: CHARNY_4 },
  { day: 5, number: 25, date: '2026-11-22', time: '15:30', home: true, opponent: BAR_2 },
  { day: 7, number: 37, date: '2026-12-06', time: '15:00', home: false, opponent: STENAY },
  { day: 8, number: 43, date: '2026-12-13', time: '15:30', home: true, opponent: SOUILLY },
  { day: 9, number: 49, date: '2026-12-19', time: '20:30', home: false, opponent: PAGNY },
  { day: 10, number: 55, date: '2027-01-10', time: '15:30', home: true, opponent: BAR_1 },
  { day: 11, number: 61, date: '2027-01-17', time: '15:00', home: false, opponent: VIGNOT_2 },
  { day: 12, number: 67, date: '2027-01-31', time: '13:30', home: false, opponent: VERDUN },
  { day: 13, number: 73, date: '2027-02-07', time: '15:30', home: true, opponent: CHARNY_2 },
  { day: 14, number: 79, date: '2027-02-13', time: '18:00', home: false, opponent: CHARNY_3 },
  { day: 15, number: 85, date: '2027-03-14', time: '15:30', home: true, opponent: CHARNY_4 },
  { day: 16, number: 91, date: '2027-03-20', time: '18:00', home: false, opponent: BAR_2 },
  { day: 18, number: 103, date: '2027-04-04', time: '15:30', home: true, opponent: STENAY },
  { day: 19, number: 109, date: '2027-04-09', time: '20:30', home: false, opponent: SOUILLY },
  { day: 20, number: 115, date: '2027-04-18', time: '15:30', home: true, opponent: PAGNY },
  { day: 21, number: 121, date: '2027-05-15', time: '20:30', home: false, opponent: BAR_1 },
  { day: 22, number: 127, date: '2027-05-23', time: '15:00', home: true, opponent: VIGNOT_2 },
]

const addDays = (iso: string, delta: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const THEMES = ['Défense sur écran', 'Tirs extérieurs', 'Transition rapide', 'Jeu sans ballon', 'Rebond et boxout']

/** The first game neither played nor in progress: the one the demo call-up points at,
 *  since the dashboard's "next fixture" block leaves the live game to the banner. */
const NEXT = FIXTURES.findIndex((f) => !f.score && !f.live)

/** Two sessions in the week before each game (five and three days ahead), so that the
 *  calendar has a rhythm to show. Invented: the club's training schedule is not
 *  published. The next session carries the demo plays, giving the dashboard something
 *  to announce under "on the programme". */
function buildTrainings(): Training[] {
  const sessions: Training[] = FIXTURES.flatMap((f, idx) => [
    { id: `seed-tr${idx}-0`, clubId: teamId(0), date: addDays(f.date, -5), time: '19:00', place: HOME_VENUE, theme: THEMES[idx % THEMES.length] },
    { id: `seed-tr${idx}-1`, clubId: teamId(0), date: addDays(f.date, -3), time: '19:00', place: HOME_VENUE, theme: THEMES[(idx + 1) % THEMES.length] },
  ])
  // On the first session still ahead on the day the seed runs, not on a fixed one: a
  // fixed session slips into the past within the week, and the dashboard only
  // announces what is to come.
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const next = sessions.find((t) => t.date >= todayIso)
  if (next) next.playIds = ['seed-sch0', 'seed-sch1']
  return sessions
}

/** A full call-up on the next game, never on one already played: it is the one the
 *  dashboard's "next fixture" block must find filled in. */
function buildConvocation(): Convocation {
  return {
    matchId: `seed-m${NEXT}`,
    playerIds: ROSTER,
    meetTime: '14:30',
    meetPlace: HOME_VENUE,
    note: 'Tenue blanche, échauffement à 14h45.',
  }
}

function buildMatch(f: Fixture, idx: number): Match {
  seq = idx * 1000
  const events: GameEvent[] = []
  if (f.score) {
    const [qA, qB] = [splitEvenly(f.score[0], 4), splitEvenly(f.score[1], 4)]
    for (let p = 1; p <= 4; p++) {
      events.push(
        ev({ type: 'PERIOD_START', period: p, gameClock: 600 }),
        ev({ type: 'CLOCK_START', period: p, gameClock: 600 }),
        ...scoreOnly('A', qA[p - 1], p),
        ...scoreOnly('B', qB[p - 1], p),
        ev({ type: 'CLOCK_STOP', period: p, gameClock: 0 }),
        ev({ type: 'PERIOD_END', period: p, gameClock: 0 }),
      )
    }
  } else if (f.live) {
    // Tip-off and nothing after it: the five on court, the first period open, the
    // clock at ten minutes and still stopped. The score stays 0-0 — a live game's
    // points would have to be invented, and the scorer can enter them from here.
    events.push(
      ev({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'A', playerIds: STARTERS, period: 1, gameClock: 600 }),
    )
  }
  return {
    id: `seed-m${idx}`,
    meta: {
      championshipLabel: LEAGUE, championshipCode: '0055 - PRM', pool: 'A', matchNumber: String(f.number),
      date: f.date, time: f.time, venue: f.home ? HOME_VENUE : undefined, coachA: TEAMS[0][1],
      clubId: teamId(0), opponentId: teamId(f.opponent),
    },
    roster: ROSTER,
    events,
    status: f.score ? 'finished' : f.live ? 'live' : 'setup',
  }
}

/** The matchday-1 games between the other teams, as published. Our own game is not
 *  among them: it is a `Match`, and the standings read it from there. */
interface OutsideGame { home: number; away: number; date: string; score: [number, number] }
const OUTSIDE_GAMES: OutsideGame[] = [
  { home: SOUILLY, away: BAR_2, date: '2026-09-25', score: [52, 65] },
  { home: BAR_1, away: CHARNY_3, date: '2026-09-26', score: [109, 30] },
  { home: VIGNOT_2, away: CHARNY_2, date: '2026-09-27', score: [21, 97] },
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
 * The whole demo season as documents, ready to be written. Pure: it touches neither
 * the network nor the browser.
 *
 * That is what lets `scripts/db.mjs seed` fill the database from a terminal, with no
 * application open and no write token to paste.
 *
 * The play's `updatedAt` is stamped here rather than by `savePlay`, which this path
 * does not go through: without it the library has nothing to order itself by and looks
 * shuffled at every opening.
 */
export function seedDocuments(): SeedDoc[] {
  const now = new Date().toISOString()
  return [
    ...TEAMS.map(([name, coach], i): SeedDoc => ({ kind: 'team', id: teamId(i), doc: coach ? { id: teamId(i), name, coach } : { id: teamId(i), name } })),
    ...PLAYERS.map((p): SeedDoc => ({ kind: 'player', id: p.id, doc: p })),
    ...FIXTURES.map((f, idx): SeedDoc => { const m = buildMatch(f, idx); return { kind: 'match', id: m.id, doc: m } }),
    ...OUTSIDE_GAMES.map((g, idx): SeedDoc => { const r = buildResult(g, idx); return { kind: 'result', id: r.id, doc: r } }),
    ...buildTrainings().map((tr): SeedDoc => ({ kind: 'training', id: tr.id, doc: tr })),
    // The two kinds filed under something other than an `id`: the call-up under its
    // game, the coach's message under its club.
    ((c) => ({ kind: 'convocation', id: c.matchId, doc: c }) as SeedDoc)(buildConvocation()),
    ((m) => ({ kind: 'message', id: m.clubId, doc: m }) as SeedDoc)(buildMessage()),
    ...buildSchemas(teamId(0)).map((s): SeedDoc => ({ kind: 'play', id: s.id, doc: { ...s, updatedAt: now } })),
  ]
}

/** The club the demo opens on. `scripts/db.mjs` prints it after seeding. */
export const SEED_CLUB_ID = teamId(0)
