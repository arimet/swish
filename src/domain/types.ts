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
}

interface EventBase { id: string; wallClock: number; period: Period; gameClock: number }
export type GameEvent =
  | (EventBase & { type: 'STARTING_FIVE'; team: TeamSide; playerIds: string[] })
  | (EventBase & { type: 'PERIOD_START' })
  | (EventBase & { type: 'PERIOD_END' })
  | (EventBase & { type: 'CLOCK_START' })
  | (EventBase & { type: 'CLOCK_STOP' })
  | (EventBase & { type: 'SCORE'; team: TeamSide; playerId: string; kind: ScoreKind })
  | (EventBase & { type: 'FOUL'; team: TeamSide; target: FoulTarget; foulType: FoulType })
  | (EventBase & { type: 'TIMEOUT'; team: TeamSide })
  | (EventBase & { type: 'SUBSTITUTION'; team: TeamSide; playerInId: string; playerOutId: string })
  | (EventBase & { type: 'STAT'; team: TeamSide; playerId: string; stat: StatKind })

export interface MatchMeta {
  championshipLabel?: string; championshipCode?: string; matchNumber?: string
  date?: string; time?: string; venue?: string; pool?: string
  referee1?: string; referee2?: string; referee3?: string
  coachA?: string; coachB?: string
  teamAId: string; teamBId: string
}
export interface Match {
  id: string
  meta: MatchMeta
  roster: { A: string[]; B: string[] }   // ids de joueurs par côté
  events: GameEvent[]
  status: 'setup' | 'live' | 'finished'
}
