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
  /**
   * Les ratures : identifiants d'évènements retirés du journal.
   *
   * Une feuille de match se fusionne entre appareils par **union** des
   * évènements, chacun portant un identifiant stable. Une union seule ne saurait
   * pas distinguer « cet évènement n'est jamais arrivé chez l'autre » de « l'autre
   * l'a annulé » : le panier annulé par le coach reviendrait dès que le marqueur,
   * qui l'a encore, repousse sa copie.
   *
   * L'évènement sort donc du journal — les écrans et les statistiques ne changent
   * pas d'un iota — mais son identifiant reste ici. Un journal note ses ratures.
   *
   * Optionnel, et pas seulement par prudence : Dexie range des objets entiers et
   * n'indexe pas ce champ, donc aucune version de base locale à ajouter.
   */
  retracted?: string[]
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

/** Qui est convoqué pour une rencontre, et où l'on se retrouve.
 *  Une seule par rencontre : `matchId` est la clé. */
export interface Convocation {
  matchId: string
  /** Joueurs convoqués, sous-ensemble de l'effectif du club. */
  playerIds: string[]
  /** Rendez-vous, souvent différent de l'heure et du lieu du match. */
  meetTime?: string
  meetPlace?: string
  /** Consignes libres : tenue, covoiturage. */
  note?: string
}

/**
 * Le message du coach à son équipe : un texte court que tout le monde lit en
 * ouvrant l'application. Ce n'est pas une messagerie — ni fil, ni réponses, ni
 * destinataires : **un seul message à la fois par club**, et en écrire un
 * nouveau remplace le précédent. La clé est donc le club, pas le message.
 */
export interface TeamMessage {
  clubId: string
  /** Le texte, tel qu'il a été écrit. Vide = pas de message (rien à afficher). */
  text: string
  /** Date ISO complète de l'écriture : l'âge s'affiche en relatif (`depuis`),
   *  car « il y a deux jours » ne pèse pas comme « il y a trois semaines ». */
  writtenAt: string
}

/** Séance d'entraînement. Existe seule, sans rencontre associée. */
export interface Training {
  id: string
  /** Club auquel appartient la séance : obligatoire, car changer de club (le hub
   *  en gère plusieurs) doit filtrer les entraînements comme les rencontres. Un
   *  entraînement sans club se mêlerait au calendrier de n'importe quel autre. */
  clubId: string
  date: string        // ISO AAAA-MM-JJ
  time?: string
  place?: string
  /** Thème de la séance : « défense sur écran », « tirs extérieurs »… */
  theme?: string
  /** Les schémas travaillés à cette séance. Sous-ensemble de la bibliothèque : un
   *  schéma supprimé depuis en est retiré par `deletePlay`, et la lecture filtre
   *  quand même sur ce qui existe. */
  playIds?: string[]
}
