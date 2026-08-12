import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch, saveResult, saveTraining, saveConvocation, savePlay } from '../persistence/repositories'
import type { Convocation, GameEvent, Match, Period, Player, ReportedResult, ScoreKind, Training } from '../domain/types'
import { kindAt } from '../domain/shotzones'
import { nouveauSchema, tempsSuivant } from '../domain/plays'
import type { Camp, Fleche, Poste, Schema, Temps, Terrain, Trait } from '../domain/plays'
import { CLUB_ID_KEY } from '../app/club'

/**
 * Données de démo (DEV uniquement) : l'Avenir de Vignot et ses cinq adversaires
 * de la saison. Versionné : re-seed automatique quand SEED_VERSION change.
 */
const SEED_VERSION = 'v24'
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

const addDays = (iso: string, delta: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = new Date()
const TODAY_ISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

// Les cinq journées de la saison, ancrées sur la date du jour du seed plutôt que
// figées : sans quoi la démonstration devient invisible dès que la vraie date passe
// la saison codée en dur (`nextFixture` compare à l'horloge réelle, jamais simulée).
// Cadence hebdomadaire inchangée : trois journées passées, une aujourd'hui, une dans
// une semaine.
const JOURNEES = [-21, -14, -7, 0, 7].map((delta) => addDays(TODAY_ISO, delta))

interface Fixture { opponent: number; date: string; time: string; status: 'finished' | 'live' | 'setup' }
// Nos cinq rencontres de la saison : trois jouées, une en direct, une à venir.
const FIXTURES: Fixture[] = [
  { opponent: 1, date: JOURNEES[0], time: '20:30', status: 'finished' },
  { opponent: 2, date: JOURNEES[1], time: '20:00', status: 'finished' },
  { opponent: 3, date: JOURNEES[2], time: '18:30', status: 'finished' },
  { opponent: 4, date: JOURNEES[3], time: '20:30', status: 'live' },
  { opponent: 5, date: JOURNEES[4], time: '18:30', status: 'setup' },
]

const THEMES = ['Défense sur écran', 'Tirs extérieurs', 'Transition rapide', 'Jeu sans ballon', 'Rebond et boxout']

/** Deux séances par semaine de rencontre (lundi et mercredi précédant le match du
 *  samedi), pour que le calendrier et le bloc « prochaine échéance » aient de quoi
 *  montrer un entraînement sans rien saisir. Exception pour la toute dernière
 *  journée — celle qui porte la convocation de démo (`buildConvocation`) : ses deux
 *  séances sont posées APRÈS la rencontre plutôt qu'avant. Sans cela, plus proches
 *  dans le temps que la rencontre convoquée, elles deviendraient la prochaine
 *  échéance juste après un seed, et le bloc « convoqués, rendez-vous, noms » — la
 *  raison d'être de cette convocation de démo — resterait invisible plusieurs jours. */
function buildTrainings(): Training[] {
  return FIXTURES.flatMap((f, idx) => {
    const dernière = idx === FIXTURES.length - 1
    const [d0, d1] = dernière ? [3, 5] : [-5, -3]
    return [
      // Seules les séances de la dernière journée sont encore à venir : c'est donc
      // la première d'entre elles qui porte les schémas de démonstration, pour que
      // le tableau de bord ait de quoi annoncer « au programme » sans rien saisir.
      { id: `seed-tr${idx}-0`, clubId: teamId(0), date: addDays(f.date, d0), time: '19:00', place: 'Gymnase de Vignot', theme: THEMES[idx % THEMES.length], playIds: dernière ? ['seed-sch0', 'seed-sch1'] : undefined },
      { id: `seed-tr${idx}-1`, clubId: teamId(0), date: addDays(f.date, d1), time: '19:00', place: 'Gymnase de Vignot', theme: THEMES[(idx + 1) % THEMES.length] },
    ]
  })
}

/** Convocation complète sur la rencontre « à venir » (statut `setup`), jamais sur
 *  une rencontre déjà jouée : c'est elle que le bloc « prochaine échéance » du
 *  tableau de bord doit trouver remplie sans rien saisir. */
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

// Confrontations entre nos cinq adversaires (jamais notre club : nos rencontres
// font déjà foi, un doublon serait ignoré par le classement). Un tour complet entre
// les six équipes de la poule : à chaque journée où nous jouons l'un des cinq, les
// quatre autres se répartissent en deux matchs — si bien que chaque adversaire
// affronte, sur la saison, les quatre autres en plus de nous. Les dates reprennent
// celles de nos FIXTURES (`JOURNEES`) : même poule, mêmes journées.
interface OutsideGame { home: number; away: number; date: string }
const OUTSIDE_GAMES: OutsideGame[] = [
  { home: 2, away: 3, date: JOURNEES[0] }, { home: 4, away: 5, date: JOURNEES[0] },
  { home: 1, away: 4, date: JOURNEES[1] }, { home: 3, away: 5, date: JOURNEES[1] },
  { home: 1, away: 5, date: JOURNEES[2] }, { home: 2, away: 4, date: JOURNEES[2] },
  { home: 1, away: 3, date: JOURNEES[3] }, { home: 2, away: 5, date: JOURNEES[3] },
  { home: 1, away: 2, date: JOURNEES[4] }, { home: 3, away: 4, date: JOURNEES[4] },
]

/** Score plausible de basket senior (60 à 90 points), variant avec l'index. */
function buildResult(g: OutsideGame, idx: number): ReportedResult {
  const homeScore = 60 + ((idx * 7 + 3) % 31)
  const awayScore0 = 60 + ((idx * 5 + 11) % 31)
  // Au basket il n'y a jamais match nul (prolongation) : si les deux formules
  // coïncident par hasard, on écarte l'égalité plutôt que de la laisser passer.
  const awayScore = awayScore0 === homeScore ? awayScore0 - 2 : awayScore0
  return {
    id: `seed-r${idx}`, championshipLabel: CHAMP, date: g.date,
    homeId: teamId(g.home), awayId: teamId(g.away), homeScore, awayScore,
  }
}

// ── Les combinaisons de démonstration ────────────────────────────────────────
// Construites avec le domaine (`nouveauSchema`, `tempsSuivant`) et non recopiées
// d'un JSON figé : un JSON se désynchronise du modèle à la première évolution.
// Coordonnées normalisées, ligne de fond du panier attaqué en y = 0 ; sur terrain
// complet, tout est divisé par deux (la moitié avant est y ≤ 0,5).

/** Un pion déplacé à ce temps : camp, poste, puis sa nouvelle position. */
type Mvt = [Camp, Poste, number, number]

/** Une flèche, écrite comme on la lit : qui, quel trait, par où elle passe. */
const fl = (poste: Poste, trait: Trait, points: [number, number][]): Fleche =>
  ({ depuis: { camp: 'attaque', poste }, trait, points: points.map(([x, y]) => ({ x, y })) })

/** Un temps de la démonstration : ce qui bouge, à qui est le ballon, ce qui se trace. */
interface Etape { deplace?: Mvt[]; ballon?: Temps['ballon']; fleches?: Fleche[] }

/**
 * Un schéma de démonstration : on part de la mise en place du domaine, puis
 * chaque étape hérite du temps précédent (`tempsSuivant` : positions et ballon,
 * jamais les flèches) et n'écrit que ce qui change. Les flèches d'un temps
 * mènent là où les pions se trouvent au temps suivant — sans quoi le coach lit
 * une combinaison qui ne se joue pas.
 */
function schemaDemo(
  idx: number, clubId: string, nom: string, note: string, dossier: string,
  terrain: Terrain, defense: boolean, etapes: Etape[],
): Schema {
  const base = nouveauSchema(clubId, terrain, defense)
  let t = base.temps[0]
  const temps = etapes.map((e, i) => {
    t = i === 0 ? t : tempsSuivant(t)
    for (const [camp, poste, x, y] of e.deplace ?? []) {
      const pion = t.pions.find((p) => p.camp === camp && p.poste === poste)
      if (pion) pion.at = { x, y }
    }
    if (e.ballon) t.ballon = e.ballon
    t.fleches = e.fleches ?? []
    return t
  })
  return { ...base, id: `seed-sch${idx}`, nom, note, dossier, temps }
}

function buildSchemas(clubId: string): Schema[] {
  return [
    // Le classique du haut : le 5 monte prendre l'écran, le 1 tourne autour par
    // l'extérieur, le 5 plonge dans le dos de son défenseur et reçoit.
    schemaDemo(0, clubId, 'Pick and roll haut', 'Écran du 5 au sommet, le 1 tourne autour, passe au 5 qui plonge.', 'Attaque placée', 'demi', true, [
      {
        deplace: [
          ['attaque', 1, 0.50, 0.66], ['attaque', 2, 0.05, 0.16], ['attaque', 3, 0.95, 0.16],
          ['attaque', 4, 0.16, 0.46], ['attaque', 5, 0.68, 0.38],
          ['defense', 1, 0.50, 0.55], ['defense', 2, 0.15, 0.16], ['defense', 3, 0.85, 0.16],
          ['defense', 4, 0.24, 0.40], ['defense', 5, 0.63, 0.32],
        ],
        fleches: [fl(5, 'ecran', [[0.68, 0.38], [0.63, 0.52], [0.585, 0.625]])],
      },
      {
        // L'écran est posé contre l'épaule droite du porteur ; le défenseur du 5
        // recule à hauteur de la raquette (il ne sort pas au contact), celui du 1
        // reste sur ses appuis.
        deplace: [['attaque', 5, 0.585, 0.625], ['defense', 5, 0.635, 0.495], ['defense', 1, 0.50, 0.56]],
        fleches: [fl(1, 'dribble', [[0.50, 0.66], [0.60, 0.685], [0.685, 0.575], [0.70, 0.44]])],
      },
      {
        // Le 1 est ressorti côté droit, son défenseur le poursuit ; celui du 5 est
        // resté haut, la voie du plongeon est ouverte.
        deplace: [['attaque', 1, 0.70, 0.44], ['defense', 1, 0.73, 0.57], ['defense', 5, 0.60, 0.52]],
        fleches: [
          fl(5, 'course', [[0.585, 0.625], [0.55, 0.42], [0.52, 0.21]]),
          fl(1, 'passe', [[0.70, 0.44], [0.63, 0.34], [0.555, 0.255]]),
        ],
      },
      {
        // La finition, jouée et non plus seulement dessinée : le 5 arrive au bout
        // de sa course (là où menait sa flèche du temps précédent) et reçoit la
        // passe. Son défenseur, resté haut sur l'écran, ne le rattrape pas ; celui
        // du 1 reste collé au porteur qui vient de lâcher le ballon.
        deplace: [['attaque', 5, 0.52, 0.21], ['defense', 5, 0.565, 0.37], ['defense', 1, 0.71, 0.51]],
        ballon: { camp: 'attaque', poste: 5 },
      },
    ]),

    // Renversement d'un côté à l'autre : le 4 sort du poste bas et va prendre le
    // corner, le ballon y arrive par l'aile.
    schemaDemo(1, clubId, 'Corner pour le 4', 'Le 4 sort du poste bas vers le corner, le ballon suit par l’aile.', 'Attaque placée', 'demi', false, [
      {
        deplace: [
          ['attaque', 1, 0.50, 0.64], ['attaque', 2, 0.82, 0.46], ['attaque', 3, 0.18, 0.46],
          ['attaque', 4, 0.31, 0.21], ['attaque', 5, 0.66, 0.36],
        ],
        fleches: [
          fl(1, 'passe', [[0.50, 0.64], [0.34, 0.55], [0.19, 0.47]]),
          fl(4, 'course', [[0.31, 0.21], [0.22, 0.15], [0.06, 0.135]]),
        ],
      },
      {
        // Le ballon a changé de main : c'est le 3 qui sert le corner, et le 5
        // traverse la raquette pour le rebond du côté du tir.
        deplace: [['attaque', 4, 0.06, 0.135]],
        ballon: { camp: 'attaque', poste: 3 },
        fleches: [
          fl(3, 'passe', [[0.18, 0.46], [0.10, 0.30], [0.065, 0.17]]),
          fl(5, 'course', [[0.66, 0.36], [0.60, 0.22], [0.44, 0.17]]),
        ],
      },
    ]),

    // Remise en jeu en boîte, sur terrain complet : le remetteur est derrière la
    // ligne de fond et le ballon attend au sol tant que l'arbitre ne l'a pas donné.
    schemaDemo(2, clubId, 'Remise ligne de fond', 'Boîte à quatre : écran du 5, le 3 coupe au panier, le 4 assure derrière.', 'Remises en jeu', 'complet', false, [
      {
        deplace: [
          ['attaque', 1, 0.62, 0.025], ['attaque', 2, 0.36, 0.20], ['attaque', 3, 0.64, 0.20],
          ['attaque', 4, 0.64, 0.09], ['attaque', 5, 0.36, 0.09],
        ],
        // Le ballon attend au sol, à l'écart du remetteur : posé sur la ligne, il
        // ne doit pas se lire comme un ballon déjà en main.
        ballon: { x: 0.82, y: 0.035 },
        fleches: [
          fl(5, 'ecran', [[0.36, 0.09], [0.47, 0.13], [0.565, 0.165]]),
          fl(3, 'course', [[0.64, 0.20], [0.585, 0.135], [0.50, 0.09]]),
          fl(2, 'course', [[0.36, 0.20], [0.20, 0.145], [0.065, 0.085]]),
          // Le 4 remonte en sécurité vers la ligne médiane : sans lui, une perte
          // de balle sur la remise part seule au panier. Sa course contourne le 3
          // par l'extérieur plutôt que de lui passer dessus.
          fl(4, 'course', [[0.64, 0.09], [0.73, 0.22], [0.60, 0.41]]),
        ],
      },
      {
        // Le ballon est en main : la remise part vers le 3, sorti de l'écran du 5.
        deplace: [['attaque', 2, 0.065, 0.085], ['attaque', 3, 0.50, 0.09], ['attaque', 4, 0.60, 0.41], ['attaque', 5, 0.565, 0.165]],
        ballon: { camp: 'attaque', poste: 1 },
        fleches: [fl(1, 'passe', [[0.62, 0.025], [0.57, 0.055], [0.505, 0.085]])],
      },
    ]),
  ]
}

export async function seedDevData(): Promise<void> {
  const already = (await db.teams.count()) > 0
  if (already && localStorage.getItem('seed-version') === SEED_VERSION) return
  // Re-seed (schéma/données de démo mis à jour). Convocations et entraînements
  // aussi : sans quoi un re-seed laisserait des orphelins rattachés à des
  // rencontres qui n'existent plus.
  await db.matches.clear(); await db.players.clear(); await db.teams.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear()

  for (let t = 0; t < TEAMS.length; t++) await saveTeam({ id: teamId(t), name: TEAMS[t][0], coach: TEAMS[t][1] })
  for (const p of PLAYERS) await savePlayer(p)
  for (let idx = 0; idx < FIXTURES.length; idx++) await saveMatch(buildMatch(FIXTURES[idx], idx))
  for (let idx = 0; idx < OUTSIDE_GAMES.length; idx++) await saveResult(buildResult(OUTSIDE_GAMES[idx], idx))
  for (const tr of buildTrainings()) await saveTraining(tr)
  await saveConvocation(buildConvocation())
  for (const s of buildSchemas(teamId(0))) await savePlay(s)

  localStorage.setItem('seed-version', SEED_VERSION)
  // L'Avenir de Vignot est le club de démonstration : sans cela, la démo s'ouvre
  // sur l'écran de bienvenue à chaque régénération des données.
  if (!localStorage.getItem(CLUB_ID_KEY)) localStorage.setItem(CLUB_ID_KEY, teamId(0))
}
