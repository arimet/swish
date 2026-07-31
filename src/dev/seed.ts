import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch } from '../persistence/repositories'
import type { GameEvent, Match, Player, ScoreKind, TeamSide } from '../domain/types'

/**
 * Données de démo (DEV uniquement). Championnat complet : poule de 6 équipes,
 * round-robin simple (15 rencontres) sur 5 journées, avec résultats + marqueurs.
 * Versionné : re-seed automatique quand SEED_VERSION change.
 */
const SEED_VERSION = 'v7'
const CHAMP = 'Pré régionale masculine · Poule A'

// [nom, entraîneur]. Les 6 premières forment la poule (round-robin) ; les autres sont dispo.
const TEAMS: [string, string][] = [
  ['AVENIR DE VIGNOT', 'BART S.'], ['BCV VERDUN', 'WEISSE F.'], ['BC BAR-LE-DUC', 'DURAND M.'],
  ['SLUC NANCY', 'LEROY P.'], ['ÉTOILE DE METZ', 'MOREAU J.'], ['USM SAINT-DIZIER', 'SIMON A.'],
  ['ASPTT NANCY', 'GARCIA L.'], ['BC LONGWY', 'DAVID T.'], ['ÉPINAL BASKET', 'ROUX H.'], ['TOUL BASKET CLUB', 'MOREL E.'],
]
const LAST = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT', 'MICHEL', 'GARCIA', 'DAVID', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL']
const FIRST = ['Lucas', 'Hugo', 'Mathis', 'Nathan', 'Louis', 'Tom', 'Théo', 'Enzo', 'Léo', 'Noah', 'Gabriel', 'Ethan', 'Adam', 'Jules', 'Sacha']

const teamId = (t: number) => `seed-t${t}`
const playerId = (t: number, i: number) => `seed-p${t}-${i}`
const makePlayers = (t: number): Player[] =>
  Array.from({ length: 10 }, (_, i) => ({ id: playerId(t, i), teamId: teamId(t), number: i + 4, lastName: LAST[(t * 7 + i) % LAST.length], firstName: FIRST[(t * 5 + i) % FIRST.length] }))

let seq = 0
const ev = (e: Omit<GameEvent, 'id' | 'wallClock'> & Record<string, unknown>): GameEvent =>
  ({ ...e, id: `seed-ev-${seq}`, wallClock: seq++ } as GameEvent)

/** Répartit ~`points` en paniers, pondérés (les premiers joueurs marquent plus). */
function baskets(side: TeamSide, roster: string[], points: number, clock: () => number): GameEvent[] {
  const weighted = roster.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id) as string[])
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++)
    out.push(ev({ type: 'SCORE', team: side, playerId: weighted[k % weighted.length], kind: '2int' as ScoreKind, period: 1, gameClock: clock() }))
  if (points % 2) out.push(ev({ type: 'SCORE', team: side, playerId: weighted[0], kind: 'lf' as ScoreKind, period: 1, gameClock: clock() }))
  return out
}

/** Quelques stats secondaires (passes, rebonds, contres) pour la démo. */
function extras(side: TeamSide, roster: string[], clock: () => number): GameEvent[] {
  const kinds: [number, 'assist' | 'reb_off' | 'reb_def' | 'block'][] = [
    [1, 'assist'], [0, 'assist'], [3, 'reb_def'], [4, 'reb_def'], [2, 'reb_off'], [4, 'block'], [0, 'reb_def'],
  ]
  return kinds.map(([i, stat]) => ev({ type: 'STAT', team: side, playerId: roster[i], stat, period: 1, gameClock: clock() }))
}

// Round-robin (méthode du cercle) pour 6 équipes → 5 journées de 3 matchs.
const ROUNDS: [number, number][][] = [
  [[0, 5], [1, 4], [2, 3]],
  [[0, 4], [5, 3], [1, 2]],
  [[0, 3], [4, 2], [5, 1]],
  [[0, 2], [3, 1], [4, 5]],
  [[0, 1], [2, 5], [3, 4]],
]
const DATES = ['2026-01-10', '2026-01-17', '2026-01-24', '2026-01-31', '2026-02-07']
const TIMES = ['20:30', '20:00', '18:30']

function buildMatch(home: number, away: number, round: number, slot: number, idx: number): Match {
  seq = idx * 1000
  // 1 seul match live (le "à la une"), journées 1-3 terminées, journée 5 à venir.
  let status: 'finished' | 'live' | 'setup'
  if (round <= 2) status = 'finished'
  else if (round === 3) status = slot === 0 ? 'live' : 'finished'
  else status = 'setup'

  const sa = 56 + ((home * 13 + away * 7 + round * 5) % 26)
  const sb = 54 + ((away * 11 + home * 3 + round * 9) % 28)
  const aStart = Array.from({ length: 5 }, (_, i) => playerId(home, i))
  const bStart = Array.from({ length: 5 }, (_, i) => playerId(away, i))
  const aRoster = Array.from({ length: 10 }, (_, i) => playerId(home, i))
  const bRoster = Array.from({ length: 10 }, (_, i) => playerId(away, i))

  let events: GameEvent[] = []
  if (status !== 'setup') {
    let c = 594
    const clock = () => (c = Math.max(60, c - 5))
    const liveA = status === 'live' ? Math.round(sa * 0.55) : sa
    const liveB = status === 'live' ? Math.round(sb * 0.55) : sb
    events = [
      ev({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'A', playerIds: aStart, period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'B', playerIds: bStart, period: 1, gameClock: 600 }),
      ev({ type: 'CLOCK_START', period: 1, gameClock: 600 }),
      ...baskets('A', aRoster, liveA, clock),
      ...baskets('B', bRoster, liveB, clock),
      ...extras('A', aRoster, clock),
      ...extras('B', bRoster, clock),
      ev({ type: 'CLOCK_STOP', period: 1, gameClock: status === 'live' ? 372 : 90 }),
    ]
    if (status === 'finished') events.push(ev({ type: 'PERIOD_END', period: 1, gameClock: 90 }))
  }

  return {
    id: `seed-m${idx}`,
    meta: { championshipLabel: CHAMP, matchNumber: String(40 + idx), date: DATES[round], time: TIMES[slot], venue: TEAMS[home][0].split(' ').pop(), coachA: TEAMS[home][1], coachB: TEAMS[away][1], referee1: 'BART S', referee2: 'WEISSE F', teamAId: teamId(home), teamBId: teamId(away) },
    roster: { A: aRoster, B: bRoster },
    events,
    status,
  }
}

export async function seedDevData(): Promise<void> {
  const already = (await db.teams.count()) > 0
  if (already && localStorage.getItem('seed-version') === SEED_VERSION) return
  // Re-seed (schéma/données de démo mis à jour)
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()

  for (let t = 0; t < TEAMS.length; t++) {
    await saveTeam({ id: teamId(t), name: TEAMS[t][0], coach: TEAMS[t][1] })
    for (const p of makePlayers(t)) await savePlayer(p)
  }
  let idx = 0
  for (let r = 0; r < ROUNDS.length; r++)
    for (let s = 0; s < ROUNDS[r].length; s++) {
      const [h, a] = ROUNDS[r][s]
      await saveMatch(buildMatch(h, a, r, s, idx++))
    }
  localStorage.setItem('seed-version', SEED_VERSION)
}
