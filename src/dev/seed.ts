import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch } from '../persistence/repositories'
import type { GameEvent, Match, Period, Player, ScoreKind } from '../domain/types'
import { kindAt } from '../domain/shotzones'
import { CLUB_ID_KEY } from '../app/club'

/**
 * Données de démo (DEV uniquement) : l'Avenir de Vignot et ses cinq adversaires
 * de la saison. Versionné : re-seed automatique quand SEED_VERSION change.
 */
const SEED_VERSION = 'v12'
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
// Dates de naissance et tailles : les petits numéros sont les meneurs (plus jeunes,
// plus petits), les grands numéros les intérieurs (plus âgés, plus grands). Le dernier
// joueur n'a ni l'une ni l'autre : c'est le cas à vérifier à l'écran (pas de bloc vide).
const BIRTH = [
  '1998-03-12', '2001-11-05', '1995-07-22', '1999-01-30', '1993-09-14',
  '1997-05-02', '2000-12-19', '1994-04-08', '1992-06-25', undefined,
]
const HEIGHT = [180, 183, 186, 188, 190, 192, 195, 198, 201, undefined]
// Notre seul effectif : l'adversaire n'a jamais de joueurs saisis.
const PLAYERS: Player[] = Array.from({ length: 10 }, (_, i) => ({
  id: playerId(i), teamId: teamId(0), number: i + 4, lastName: LAST[i], firstName: FIRST[i],
  birthDate: BIRTH[i], height: HEIGHT[i],
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

/** Poids d'un joueur pour la répartition des paniers : les premiers numéros de
 *  l'effectif marquent plus, à ancienneté égale sur le terrain. */
const weightFor = (id: string) => Math.max(1, 8 - ROSTER.indexOf(id))

/** Répartit ~`points` en paniers positionnés parmi les joueurs actuellement sur le
 *  terrain (`onCourtIds`) — jamais un joueur qui n'y est pas —, pondérés (les
 *  premiers marquent plus), avec un tir manqué toutes les trois tentatives pour
 *  alimenter les hot zones. */
function baskets(points: number, clock: () => number, period: Period, onCourtIds: string[]): GameEvent[] {
  const weighted = onCourtIds.flatMap((id) => Array(weightFor(id)).fill(id) as string[])
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) {
    const playerId = weighted[k % weighted.length]
    const shot = SPOTS[k % SPOTS.length]
    out.push(ev({ type: 'SCORE', team: 'A', playerId, kind: kindAt(shot.x, shot.y), shot, period, gameClock: clock() }))
    if (k % 3 === 2) {
      const missed = SPOTS[(k + 4) % SPOTS.length]
      out.push(ev({ type: 'MISS', team: 'A', playerId, kind: kindAt(missed.x, missed.y), shot: missed, period, gameClock: clock() }))
    }
  }
  if (points % 2) out.push(ev({ type: 'SCORE', team: 'A', playerId: weighted[0], kind: 'lf' as ScoreKind, period, gameClock: clock() }))
  return out
}

/** Statistiques secondaires : une par joueur actuellement sur le terrain, à chaque
 *  période — une vingtaine sur un match complet — pour que les moyennes par match
 *  soient parlantes, sans jamais créditer un joueur resté sur le banc. */
function extras(clock: () => number, period: Period, onCourtIds: string[]): GameEvent[] {
  const STATS = ['assist', 'reb_off', 'reb_def', 'block'] as const
  return onCourtIds.map((playerId, k) => ev({ type: 'STAT', team: 'A', playerId, stat: STATS[k % STATS.length], period, gameClock: clock() }))
}

/** Score de l'adversaire : uniquement des paniers d'équipe, sans joueur identifié
 *  ni position de tir — l'adversaire n'a pas d'effectif à détailler. */
function opponentBaskets(points: number, clock: () => number, period: Period): GameEvent[] {
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) out.push(ev({ type: 'SCORE', team: 'B', kind: '2int', period, gameClock: clock() }))
  if (points % 2) out.push(ev({ type: 'SCORE', team: 'B', kind: 'lf', period, gameClock: clock() }))
  return out
}

const STARTERS = ROSTER.slice(0, 5)
// [titulaire sortant, remplaçant entrant], un par période (aucun en période 4).
const SUB_SWAPS: [number, number][] = [[0, 5], [1, 6], [2, 7]]

/** Répartit un total en `parts` entiers aussi égaux que possible. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const rest = total % parts
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0))
}

/** Une période de jeu : paniers des deux équipes et stats secondaires, avec un
 *  remplaçant qui entre à la moitié si la période en a un — seuls les joueurs
 *  réellement sur le terrain à cet instant peuvent marquer ou être crédités.
 *  Le chrono descend jusqu'à `stopClock` (0 pour une période jouée en entier).
 *  Le remplacement est posé au milieu exact du temps de la période (et non au
 *  gré du nombre de paniers déjà écoulés) : c'est cette valeur de chrono, pas le
 *  nombre de tirs, que `playingTimes` utilise pour calculer le temps de jeu. */
function periodEvents(p: Period, pointsA: number, pointsB: number, onCourtBefore: string[], swap: [number, number] | undefined, stopClock: number): { events: GameEvent[]; onCourtAfter: string[] } {
  let c = 600
  const clock = () => (c = Math.max(stopClock, c - 5))
  const half = Math.round(pointsA / 2)
  const events = [...baskets(half, clock, p, onCourtBefore)]
  let onCourtAfter = onCourtBefore
  if (swap) {
    const [out, into] = swap
    c = Math.round((600 + stopClock) / 2)
    events.push(ev({ type: 'SUBSTITUTION', team: 'A', playerOutId: playerId(out), playerInId: playerId(into), period: p, gameClock: c }))
    onCourtAfter = onCourtBefore.map((id) => (id === playerId(out) ? playerId(into) : id))
  }
  events.push(
    ...baskets(pointsA - half, clock, p, onCourtAfter),
    ...opponentBaskets(pointsB, clock, p),
    ...extras(clock, p, onCourtAfter),
    ev({ type: 'CLOCK_STOP', period: p, gameClock: stopClock }),
  )
  return { events, onCourtAfter }
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
  const sa = 56 + ((idx * 13 + 7) % 26) // score final de l'Avenir, rencontre complète
  const sb = 54 + ((idx * 11 + 3) % 28) // score final adverse, rencontre complète
  const qA = splitEvenly(sa, 4)
  const qB = splitEvenly(sb, 4)

  let events: GameEvent[] = []
  if (f.status !== 'setup') {
    // Les quatre périodes pour un match terminé. Pour un match en direct, on
    // s'arrête au milieu de la deuxième plutôt qu'à la fin : la rencontre doit
    // rester en cours, pas déjà jouée.
    const lastPeriod = f.status === 'live' ? 2 : 4
    const lastClock = f.status === 'live' ? 300 : 0

    events.push(
      ev({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
      ev({ type: 'STARTING_FIVE', team: 'A', playerIds: STARTERS, period: 1, gameClock: 600 }),
      ev({ type: 'CLOCK_START', period: 1, gameClock: 600 }),
    )
    let onCourt: string[] = STARTERS
    for (let p = 1; p <= lastPeriod; p++) {
      const isLast = p === lastPeriod
      const stopClock = isLast ? lastClock : 0
      const { events: periodEvs, onCourtAfter } = periodEvents(p, qA[p - 1], qB[p - 1], onCourt, SUB_SWAPS[p - 1], stopClock)
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
