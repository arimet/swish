export type TeamSide = 'A' | 'B'
export type ScoreKind = '2int' | '2ext' | '3' | 'lf'
/** Secondary stats credited to a player. */
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
  /** Birth date in ISO `YYYY-MM-DD`. Age is derived at display time and never
   *  stored: a hard-coded age goes wrong on the first birthday. */
  birthDate?: string
  /** Height in centimetres. */
  height?: number
}

interface EventBase { id: string; wallClock: number; period: Period; gameClock: number }

/** A shot's position, normalised within the half court:
 *  x 0..1 from the left sideline to the right,
 *  y 0..1 from the baseline to the half-way line. */
export interface ShotSpot { x: number; y: number }

export type GameEvent =
  | (EventBase & { type: 'STARTING_FIVE'; team: TeamSide; playerIds: string[] })
  | (EventBase & { type: 'PERIOD_START' })
  | (EventBase & { type: 'PERIOD_END' })
  | (EventBase & { type: 'CLOCK_START' })
  | (EventBase & { type: 'CLOCK_STOP' })
  // No playerId = a team basket with no identified player (the opponent's score).
  // No shot = a shot entered without a position (free throw, or a game predating the shot chart).
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
  /** Our club. The app only ever details one team. */
  clubId: string
  /** The opponent: a team record with no roster, for which only the score is entered. */
  opponentId: string
}
export interface Match {
  id: string
  meta: MatchMeta
  /** Notre effectif. L'adversaire n'en a pas. */
  roster: string[]
  events: GameEvent[]
  status: 'setup' | 'live' | 'finished'
  /**
   * Retractions: ids of events taken out of the log.
   *
   * A match sheet merges across devices by **union** of its events, each carrying a
   * stable id. A union alone cannot tell "this event never reached the other device"
   * from "the other device undid it": the basket the coach cancelled would come back
   * as soon as the scorer, who still has it, pushes their copy.
   *
   * The event therefore leaves the log — screens and statistics do not change one
   * bit — but its id stays here. A log records its own crossings-out.
   *
   * Optional, and not merely out of caution: Dexie stores whole objects and does not
   * index this field, so there is no local database version to add.
   */
  retracted?: string[]
}

/**
 * The result of a game between two other teams, copied by hand from the federation's
 * site. This is **not** a `Match`: we know neither its roster nor how it unfolded,
 * nothing beyond the final score. Forcing it into a game's shape would mean inventing
 * basket events nobody ever observed.
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

/** Who is called up for a game, and where everyone meets.
 *  One per game: `matchId` is the key. */
export interface Convocation {
  matchId: string
  /** Called-up players, a subset of the club's roster. */
  playerIds: string[]
  /** Meeting point, often different from the game's own time and venue. */
  meetTime?: string
  meetPlace?: string
  /** Free-form notes: kit, car sharing. */
  note?: string
}

/**
 * The coach's message to the team: a short text everyone reads when opening the app.
 * This is not a messaging system — no thread, no replies, no recipients: **one message
 * at a time per club**, and writing a new one replaces the previous. The key is
 * therefore the club, not the message.
 */
export interface TeamMessage {
  clubId: string
  /** The text as written. Empty = no message (nothing to show). */
  text: string
  /** Full ISO date of writing: the age is shown relative (`since`), because "two days
   *  ago" does not weigh the same as "three weeks ago". */
  writtenAt: string
}

/** A training session. Stands alone, with no game attached. */
export interface Training {
  id: string
  /** The club the session belongs to: mandatory, because switching club (the hub
   *  handles several) must filter trainings the way it filters games. A training with
   *  no club would blend into any other club's calendar. */
  clubId: string
  date: string        // ISO AAAA-MM-JJ
  time?: string
  place?: string
  /** The session's theme: "defending screens", "outside shooting"… */
  theme?: string
  /** The plays worked on in this session. A subset of the library: a play deleted
   *  since is removed by `deletePlay`, and reads still filter on what exists. */
  playIds?: string[]
}
