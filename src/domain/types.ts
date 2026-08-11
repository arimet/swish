export type TeamSide = 'A' | 'B'
export type ScoreKind = '2int' | '2ext' | '3' | 'lf'
/** Statistiques secondaires attribuées à un joueur. */
export type StatKind = 'assist' | 'reb_off' | 'reb_def' | 'block'
export type FoulType = 'personal' | 'technical' | 'unsportsmanlike' | 'disqualifying'
export type FoulTarget =
  | { kind: 'player'; playerId: string }
  | { kind: 'coach' }
  | { kind: 'bench' }
export type Period = number // 1..4 = périodes, 5+ = prolongations

export interface Team { id: string; name: string; coach?: string }
export interface Player {
  id: string; teamId: string; number: number
  lastName: string; firstName: string; license?: string
  /** Date de naissance au format ISO `AAAA-MM-JJ`. L'âge s'en déduit à l'affichage,
   *  il n'est jamais stocké : un âge en dur devient faux au premier anniversaire. */
  birthDate?: string
  /** Taille en centimètres. */
  height?: number
}

interface EventBase { id: string; wallClock: number; period: Period; gameClock: number }

/** Position d'un tir, normalisée dans le demi-terrain :
 *  x 0..1 de la touche gauche à la touche droite,
 *  y 0..1 de la ligne de fond à la ligne médiane. */
export interface ShotSpot { x: number; y: number }

export type GameEvent =
  | (EventBase & { type: 'STARTING_FIVE'; team: TeamSide; playerIds: string[] })
  | (EventBase & { type: 'PERIOD_START' })
  | (EventBase & { type: 'PERIOD_END' })
  | (EventBase & { type: 'CLOCK_START' })
  | (EventBase & { type: 'CLOCK_STOP' })
  // playerId absent = panier d'équipe sans joueur identifié (score adverse en mode solo).
  // shot absent = tir saisi sans position (lancer franc, ou match antérieur à la carte de tir).
  | (EventBase & { type: 'SCORE'; team: TeamSide; playerId?: string; kind: ScoreKind; shot?: ShotSpot })
  | (EventBase & { type: 'MISS'; team: TeamSide; playerId: string; kind: ScoreKind; shot: ShotSpot })
  | (EventBase & { type: 'FOUL'; team: TeamSide; target: FoulTarget; foulType: FoulType })
  | (EventBase & { type: 'TIMEOUT'; team: TeamSide })
  | (EventBase & { type: 'SUBSTITUTION'; team: TeamSide; playerInId: string; playerOutId: string })
  | (EventBase & { type: 'STAT'; team: TeamSide; playerId: string; stat: StatKind })

export interface MatchMeta {
  championshipLabel?: string; championshipCode?: string; matchNumber?: string
  date?: string; time?: string; venue?: string; pool?: string
  referee1?: string; referee2?: string; referee3?: string
  coachA?: string
  /** Notre club. L'application ne détaille jamais qu'une équipe. */
  clubId: string
  /** L'adversaire : une fiche équipe sans effectif, dont on ne saisit que le score. */
  opponentId: string
}
export interface Match {
  id: string
  meta: MatchMeta
  /** Notre effectif. L'adversaire n'en a pas. */
  roster: string[]
  events: GameEvent[]
  status: 'setup' | 'live' | 'finished'
}

/**
 * Résultat d'une rencontre entre deux autres équipes, relevé à la main sur le site
 * de la fédération. Ce n'est **pas** une `Match` : on n'en connaît ni l'effectif, ni
 * le déroulé, rien d'autre que le score final. Le forcer dans le moule d'une rencontre
 * obligerait à fabriquer des évènements de panier qui n'ont jamais été observés.
 */
export interface ReportedResult {
  id: string
  /** Championnat auquel la rencontre appartient, pour grouper le classement. */
  championshipLabel: string
  date?: string
  homeId: string
  awayId: string
  homeScore: number
  awayScore: number
}
