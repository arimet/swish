import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch } from '../persistence/repositories'
import type { GameEvent, Match, Player, ScoreKind } from '../domain/types'
import { kindAt } from '../domain/shotzones'
import { CLUB_ID_KEY } from '../app/club'

/**
 * Données de démo (DEV uniquement) : l'Avenir de Vignot et ses cinq adversaires
 * de la saison. Versionné : re-seed automatique quand SEED_VERSION change.
 */
const SEED_VERSION = 'v10'
const CHAMP = 'Pré régionale masculine · Poule A'

// [nom, entraîneur]. La première équipe est la nôtre ; les cinq suivantes sont nos adversaires.
const TEAMS: [string, string][] = [
  ['AVENIR DE VIGNOT', 'BART S.'], ['BCV VERDUN', 'WEISSE F.'], ['BC BAR-LE-DUC', 'DURAND M.'],
  ['SLUC NANCY', 'LEROY P.'], ['ÉTOILE DE METZ', 'MOREAU J.'], ['USM SAINT-DIZIER', 'SIMON A.'],
]
const LAST = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON']
const FIRST = ['Lucas', 'Hugo', 'Mathis', 'Nathan', 'Louis', 'Tom', 'Théo', 'Enzo', 'Léo', 'Noah']

const teamId = (t: number) => `seed-t${t}`
const playerId = (i: number) => `seed-p${i}`
// Notre seul effectif : l'adversaire n'a jamais de joueurs saisis.
const PLAYERS: Player[] = Array.from({ length: 10 }, (_, i) => ({
  id: playerId(i), teamId: teamId(0), number: i + 4, lastName: LAST[i], firstName: FIRST[i],
}))
const ROSTER = PLAYERS.map((p) => p.id)

let seq = 0
const ev = (e: Omit<GameEvent, 'id' | 'wallClock'> & Record<string, unknown>): GameEvent =>
  ({ ...e, id: `seed-ev-${seq}`, wallClock: seq++ } as GameEvent)

/** Positions de tir plausibles : beaucoup de raquette, des corners, un peu d'axe. */
const SPOTS: { x: number; y: number }[] = [
  { x: 0.50, y: 0.14 }, { x: 0.45, y: 0.18 }, { x: 0.56, y: 0.16 }, // raquette
  { x: 0.24, y: 0.24 }, { x: 0.76, y: 0.24 }, { x: 0.50, y: 0.45 }, // mi-distance
  { x: 0.03, y: 0.10 }, { x: 0.97, y: 0.11 }, { x: 0.50, y: 0.68 }, // 3 points
]

/** Répartit ~`points` en paniers positionnés, pondérés (les premiers joueurs marquent
 *  plus), avec un tir manqué toutes les trois tentatives pour alimenter les hot zones. */
function baskets(points: number, clock: () => number): GameEvent[] {
  const weighted = ROSTER.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id) as string[])
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) {
    const playerId = weighted[k % weighted.length]
    const shot = SPOTS[k % SPOTS.length]
    out.push(ev({ type: 'SCORE', team: 'A', playerId, kind: kindAt(shot.x, shot.y), shot, period: 1, gameClock: clock() }))
    if (k % 3 === 2) {
      const missed = SPOTS[(k + 4) % SPOTS.length]
      out.push(ev({ type: 'MISS', team: 'A', playerId, kind: kindAt(missed.x, missed.y), shot: missed, period: 1, gameClock: clock() }))
    }
  }
  if (points % 2) out.push(ev({ type: 'SCORE', team: 'A', playerId: weighted[0], kind: 'lf' as ScoreKind, period: 1, gameClock: clock() }))
  return out
}

/** Statistiques secondaires, réparties sur tout l'effectif : une vingtaine par
 *  rencontre pour que les moyennes par match soient parlantes. */
function extras(clock: () => number): GameEvent[] {
  const STATS = ['assist', 'reb_off', 'reb_def', 'block'] as const
  return Array.from({ length: 20 }, (_, k) =>
    ev({ type: 'STAT', team: 'A', playerId: ROSTER[k % ROSTER.length], stat: STATS[k % STATS.length], period: 1, gameClock: clock() }))
}

/** Score de l'adversaire : uniquement des paniers d'équipe, sans joueur identifié
 *  ni position de tir — l'adversaire n'a pas d'effectif à détailler. */
function opponentBaskets(points: number, clock: () => number): GameEvent[] {
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) out.push(ev({ type: 'SCORE', team: 'B', kind: '2int', period: 1, gameClock: clock() }))
  if (points % 2) out.push(ev({ type: 'SCORE', team: 'B', kind: 'lf', period: 1, gameClock: clock() }))
  return out
}

/** Rotations : trois titulaires cèdent leur place à trois remplaçants, à des instants
 *  échelonnés du chrono — sans elles, seuls les cinq titulaires auraient du temps de jeu. */
function rotations(stopClock: number): GameEvent[] {
  const window = 600 - stopClock
  const at = [0.25, 0.5, 0.75].map((f) => Math.round(600 - window * f))
  const swaps: [number, number][] = [[0, 5], [1, 6], [2, 7]] // [titulaire sortant, remplaçant entrant]
  return swaps.map(([out, into], i) => ev({
    type: 'SUBSTITUTION', team: 'A', playerOutId: playerId(out), playerInId: playerId(into),
    period: 1, gameClock: at[i],
  }))
}

interface Fixture { opponent: number; date: string; time: string; status: 'finished' | 'live' | 'setup' }
// Nos cinq rencontres de la saison : trois jouées, une en direct, une à venir.
const FIXTURES: Fixture[] = [
  { opponent: 1, date: '2026-01-10', time: '20:30', status: 'finished' },
  { opponent: 2, date: '2026-01-17', time: '20:00', status: 'finished' },
  { opponent: 3, date: '2026-01-24', time: '18:30', status: 'finished' },
  { opponent: 4, date: '2026-01-31', time: '20:30', status: 'live' },
  { opponent: 5, date: '2026-02-07', time: '18:30', status: 'setup' },
]

function buildMatch(f: Fixture, idx: number): Match {
  seq = idx * 1000
  const starters = ROSTER.slice(0, 5)
  const sa = 56 + ((idx * 13 + 7) % 26)
  const sb = 54 + ((idx * 11 + 3) % 28)
  const stopClock = f.status === 'live' ? 372 : 90

  let events: GameEvent[] = []
  if (f.status !== 'setup') {
    let c = 594
    const clock = () => (c = Math.max(60, c - 5))
    const liveA = f.status === 'live' ? Math.round(sa * 0.55) : sa
    const liveB = f.status === 'live' ? Math.round(sb * 0.55) : sb
    const halfA = Math.round(liveA / 2)
    events = [
      ev({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'A', playerIds: starters, period: 1, gameClock: 600 }),
      ev({ type: 'CLOCK_START', period: 1, gameClock: 600 }),
      ...baskets(halfA, clock),
      ...rotations(stopClock),
      ...baskets(liveA - halfA, clock),
      ...opponentBaskets(liveB, clock),
      ...extras(clock),
      ev({ type: 'CLOCK_STOP', period: 1, gameClock: stopClock }),
    ]
    if (f.status === 'finished') events.push(ev({ type: 'PERIOD_END', period: 1, gameClock: stopClock }))
  }

  return {
    id: `seed-m${idx}`,
    meta: {
      championshipLabel: CHAMP, matchNumber: String(idx + 1), date: f.date, time: f.time,
      venue: idx % 2 === 0 ? 'Vignot' : TEAMS[f.opponent][0].split(' ').pop(), coachA: TEAMS[0][1],
      referee1: 'BART S', referee2: 'WEISSE F', clubId: teamId(0), opponentId: teamId(f.opponent),
    },
    roster: ROSTER,
    events,
    status: f.status,
  }
}

export async function seedDevData(): Promise<void> {
  const already = (await db.teams.count()) > 0
  if (already && localStorage.getItem('seed-version') === SEED_VERSION) return
  // Re-seed (schéma/données de démo mis à jour)
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()

  for (let t = 0; t < TEAMS.length; t++) await saveTeam({ id: teamId(t), name: TEAMS[t][0], coach: TEAMS[t][1] })
  for (const p of PLAYERS) await savePlayer(p)
  for (let idx = 0; idx < FIXTURES.length; idx++) await saveMatch(buildMatch(FIXTURES[idx], idx))

  localStorage.setItem('seed-version', SEED_VERSION)
  // L'Avenir de Vignot est le club de démonstration : sans cela, la démo s'ouvre
  // sur l'écran de bienvenue à chaque régénération des données.
  if (!localStorage.getItem(CLUB_ID_KEY)) localStorage.setItem(CLUB_ID_KEY, teamId(0))
}
