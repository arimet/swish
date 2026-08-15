import { db } from '../persistence/db'
import { saveTeam, savePlayer, saveMatch, saveResult, saveTraining, saveConvocation, savePlay, saveMessage } from '../persistence/repositories'
import type { Convocation, GameEvent, Match, TeamMessage, Period, Player, ReportedResult, ScoreKind, StatKind, Training } from '../domain/types'
import { kindAt } from '../domain/shotzones'
import { newPlay, nextStep } from '../domain/plays'
import type { Side, Arrow, Position, Play, Step, Court, Stroke } from '../domain/plays'
import { CLUB_ID_KEY } from '../app/club'

/**
 * Données de démo (DEV uniquement) : l'Avenir de Vignot et ses cinq adversaires
 * de la saison.
 *
 * Le seed ne se rejoue que si sa version a changé, sinon on écraserait à chaque
 * ouverture ce qu'un développeur vient de saisir à la main. Cette version était un
 * numéro à incrémenter **de mémoire** : on tenait donc pour acquis que quiconque
 * touche aux données penserait à le bumper. Ça a échoué dès la deuxième fois — la
 * répartition des paniers a été corrigée sans que la version bouge, et les
 * navigateurs déjà à jour sur l'ancienne version n'ont rien régénéré. Le défaut se
 * lisait comme un bug des données, alors que c'était un bug de la garde.
 *
 * `SEED_DATA_VERSION` reste manuel pour ce que l'empreinte ne voit pas (la logique
 * de construction, les combinaisons), mais l'empreinte des **tables déclaratives**
 * s'y ajoute : toucher un joueur, un poids, un score ou une rotation change la
 * version tout seul. Voir `EMPREINTE_DONNEES`, tout en bas.
 */
const SEED_DATA_VERSION = 'v28'
const CHAMP = 'Pré régionale masculine · Poule A'

// [nom, entraîneur]. La première équipe est la nôtre ; les cinq suivantes sont nos adversaires.
const TEAMS: [string, string][] = [
  ['AVENIR DE VIGNOT', 'FRANZONI Jean Marc'], ['BCV VERDUN', 'WEISSE F.'], ['BC BAR-LE-DUC', 'DURAND M.'],
  ['SLUC NANCY', 'LEROY P.'], ['ÉTOILE DE METZ', 'MOREAU J.'], ['USM SAINT-DIZIER', 'SIMON A.'],
]
/**
 * L'effectif réel, dans l'ordre des numéros de maillot. Les noms de famille sont
 * en capitales, comme le fait `TeamCreate` à la saisie : une seule convention dans
 * toute l'application, sinon la liste des convoqués mélange deux graphies.
 *
 * Ni date de naissance ni taille : ce sont des personnes réelles, et je n'invente
 * pas de données personnelles les concernant. Les deux champs sont optionnels, et
 * l'écran gère leur absence — c'est d'ailleurs le cas que l'ancien seed vérifiait
 * avec son dernier joueur sans données. Ils se remplissent depuis la fiche d'équipe.
 */
const EFFECTIF: [numero: number, name: string, prenom: string][] = [
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

/** Notre seul effectif : l'adversaire n'a jamais de joueurs saisis. */
const PLAYERS: Player[] = EFFECTIF.map(([number, lastName, firstName], i) => ({
  id: playerId(i), teamId: teamId(0), number, lastName, firstName,
}))
/** L'identifiant du joueur portant ce numéro. Le seed raisonne en numéros — c'est
 *  ce que dit un coach — et l'index dans le tableau n'est qu'un détail de stockage. */
const parNumero = (n: number) => playerId(EFFECTIF.findIndex(([num]) => num === n))
const ROSTER = PLAYERS.map((p) => p.id)

let seq = 0
const ev = (e: Omit<GameEvent, 'id' | 'wallClock'> & Record<string, unknown>): GameEvent =>
  ({ ...e, id: `seed-ev-${seq}`, wallClock: seq++ } as GameEvent)

/** Positions de tir plausibles, **séparées par valeur**.
 *
 *  Elles tenaient dans une seule liste parcourue en `k % longueur`, et les trois
 *  dernières — celles à trois points — n'étaient jamais atteintes : un segment de
 *  match compte cinq paniers, `k` ne dépassait donc jamais l'indice 4. La colonne
 *  3PT de la feuille de match affichait zéro pour tout l'effectif, sur toutes les
 *  rencontres. Le seed choisit maintenant la **valeur** du tir, puis une position
 *  qui la porte ; `kindAt` reste seul juge du côté de la ligne, et le test du seed
 *  vérifie que ces trois positions sont bien derrière. */
const SPOTS_2: { x: number; y: number }[] = [
  { x: 0.50, y: 0.14 }, { x: 0.45, y: 0.18 }, { x: 0.56, y: 0.16 }, // raquette
  { x: 0.24, y: 0.24 }, { x: 0.76, y: 0.24 }, { x: 0.50, y: 0.45 }, // mi-distance
]
const SPOTS_3: { x: number; y: number }[] = [
  { x: 0.03, y: 0.10 }, { x: 0.97, y: 0.11 }, { x: 0.50, y: 0.68 }, // corners et axe
]

/** Poids d'un joueur dans la répartition des paniers, par numéro de maillot.
 *
 *  Ces valeurs sont **inventées**, à une exception près : BUZZI est le meilleur
 *  marqueur parce qu'on me l'a dit. Le reste est seulement plausible et se corrige
 *  depuis l'application.
 *
 *  Elles sont volontairement resserrées. Un écart plus large ne produit pas un
 *  meilleur marqueur plus net, il produit une aberration : à poids 12 contre 1,
 *  BUZZI prenait trente-neuf points par match et cinq joueurs terminaient à zéro.
 *  Ce qui donne une feuille de match crédible, c'est un rapport d'environ trois
 *  entre le premier et le dernier, pas un rapport de dix.
 *
 *  L'ancien calcul dérivait le poids du rang dans la liste, ce qui ne marche plus
 *  depuis que les titulaires ne sont plus les cinq premiers de l'effectif. */
const POIDS: Record<number, number> = {
  11: 6,                       // BUZZI, le meilleur marqueur
  13: 4, 2: 4,                 // ses deux relais
  15: 3, 17: 2,                // les deux autres titulaires
  5: 3, 20: 3, 10: 2, 7: 2, 6: 2, 8: 2, // le banc
}
const numeroDe = (id: string) => EFFECTIF[Number(id.replace('seed-p', ''))]?.[0] ?? 0
const weightFor = (id: string) => POIDS[numeroDe(id)] ?? 1

/**
 * Le rôle de chaque maillot. Une seule étiquette par joueur, et non un tableau de
 * poids par catégorie : c'est ce qu'un coach écrit, et ça suffit à répartir tout le
 * reste de la feuille de match. Inventé, comme `POIDS`, à l'exception du cinq majeur
 * qu'on m'a donné.
 */
type Role = 'meneur' | 'ailier' | 'interieur'
const ROLES: Record<number, Role> = {
  2: 'meneur', 5: 'meneur',
  11: 'ailier', 13: 'ailier', 7: 'ailier', 10: 'ailier', 6: 'ailier',
  15: 'interieur', 17: 'interieur', 20: 'interieur', 8: 'interieur',
}
const roleDe = (id: string): Role => ROLES[numeroDe(id)] ?? 'ailier'

/**
 * Ce que produit chaque poste, par catégorie. Les rapports comptent plus que les
 * valeurs : un meneur distribue, un intérieur prend le rebond et contre, et les
 * fautes suivent le contact — donc l'intérieur en prend un peu plus.
 *
 * Ces poids passent par le même répartiteur que les paniers, à dessein : c'est déjà
 * lui qui garantit qu'un joueur peu servi finit par l'être, et qu'un remplaçant ne
 * termine pas la saison à zéro rebond.
 */
const POIDS_STAT: Record<StatKind | 'faute', Record<Role, number>> = {
  assist: { meneur: 5, ailier: 2, interieur: 1 },
  reb_off: { meneur: 1, ailier: 2, interieur: 4 },
  reb_def: { meneur: 1, ailier: 2, interieur: 4 },
  block: { meneur: 1, ailier: 1, interieur: 5 },
  faute: { meneur: 2, ailier: 2, interieur: 3 },
}

/** Ce qu'une période produit, en volumes d'équipe. Un match complet en donne quatre
 *  fois autant, soit une trentaine de rebonds et quatre contres : l'ordre de grandeur
 *  d'une feuille de match de Pré régionale. */
const PAR_PERIODE: [StatKind, number][] = [['reb_def', 6], ['reb_off', 2], ['block', 1]]

/** Les fautes d'équipe, période par période. La troisième dépasse `TEAM_FOUL_BONUS`
 *  (cinq, en FFBB) : c'est volontaire, la démonstration doit pouvoir montrer la
 *  pastille « Bonus » sans qu'on la provoque à la main. */
const FAUTES_PAR_PERIODE = [3, 4, 5, 4]

/** Personne ne sort pour cinq fautes. Un joueur exclu quitte le terrain, alors que
 *  les rotations du seed le comptent encore présent — l'incohérence se lirait comme
 *  un bug des règles. */
const MAX_FAUTES = 4

/**
 * Un répartiteur proportionnel, par plus fort diviseur : à chaque attribution, on
 * sert celui dont `poids / (déjà servi + 1)` est le plus grand.
 *
 * Il était écrit à la main dans `baskets` et il sert maintenant à six choses
 * (paniers, passes, deux sortes de rebonds, contres, fautes) : c'est la même
 * question à chaque fois, et les trois défauts qu'il a fallu corriger pour les
 * paniers — liste pré-remplie parcourue en modulo, compteur remis à zéro à chaque
 * segment — se seraient reproduits à l'identique cinq fois de plus.
 *
 * Le compteur est détenu par le répartiteur, donc par la rencontre : la
 * proportionnalité se joue sur le match et non sur un segment de cinq paniers.
 */
interface Repartiteur {
  prochain: (candidats: string[]) => string
  count: (id: string) => number
}
function repartiteur(poids: (id: string) => number): Repartiteur {
  const servi = new Map<string, number>()
  const count = (id: string) => servi.get(id) ?? 0
  const value = (id: string) => poids(id) / (count(id) + 1)
  return {
    count,
    prochain(candidats) {
      const gagnant = candidats.reduce((meilleur, id) => (value(id) > value(meilleur) ? id : meilleur))
      servi.set(gagnant, count(gagnant) + 1)
      return gagnant
    },
  }
}

/** Les six répartiteurs d'une rencontre. */
type Repartition = Record<'basket' | StatKind | 'faute', Repartiteur>
const nouvelleRepartition = (): Repartition => ({
  basket: repartiteur(weightFor),
  assist: repartiteur((id) => POIDS_STAT.assist[roleDe(id)]),
  reb_off: repartiteur((id) => POIDS_STAT.reb_off[roleDe(id)]),
  reb_def: repartiteur((id) => POIDS_STAT.reb_def[roleDe(id)]),
  block: repartiteur((id) => POIDS_STAT.block[roleDe(id)]),
  faute: repartiteur((id) => POIDS_STAT.faute[roleDe(id)]),
})

/** Répartit ~`points` en paniers positionnés parmi les joueurs actuellement sur le
 *  terrain (`onCourtIds`) — jamais un joueur qui n'y est pas —, pondérés (les
 *  premiers marquent plus), avec un tir manqué toutes les trois tentatives pour
 *  alimenter les hot zones. */
function baskets(points: number, clock: () => number, period: Period, onCourtIds: string[], r: Repartition): GameEvent[] {
  /**
   * La décomposition du total en tirs réels, et elle doit retomber **juste** : le
   * segment reçoit un nombre de points à distribuer, et un seed qui compose ce total
   * avec des tirs de valeurs différentes sans vérifier la somme fait dire deux
   * choses différentes au tableau d'affichage et à la feuille de match.
   *
   * Environ un tir à trois points pour neuf points marqués, soit six à huit par
   * rencontre : l'ordre de grandeur d'une équipe qui n'en fait pas son système.
   * Le reste en paniers à deux, et le point impair en lancer franc.
   */
  const n3 = Math.floor(points / 9)
  const nLf = (points - 3 * n3) % 2
  const n2 = (points - 3 * n3 - nLf) / 2
  const tirs = n3 + n2

  const out: GameEvent[] = []
  let i2 = 0
  let i3 = 0
  for (let k = 0; k < tirs; k++) {
    // Les trois points **répartis** dans le segment plutôt que groupés en tête : un
    // quart-temps qui commence par tous ses tirs primés ne ressemble à rien sur la
    // carte de tirs. Le test du seuil entier est le même que celui d'un tracé de
    // ligne — il place `n3` marques sur `tirs` positions, aussi régulièrement que
    // des entiers le permettent.
    const troisPoints = Math.floor(((k + 1) * n3) / tirs) > Math.floor((k * n3) / tirs)
    const shot = troisPoints ? SPOTS_3[i3++ % SPOTS_3.length] : SPOTS_2[i2++ % SPOTS_2.length]
    const playerId = r.basket.prochain(onCourtIds)
    out.push(ev({ type: 'SCORE', team: 'A', playerId, kind: kindAt(shot.x, shot.y), shot, period, gameClock: clock() }))

    // Une passe décisive sur un panier sur deux, créditée à un coéquipier **présent
    // sur le terrain** et jamais au marqueur lui-même. Attachée au panier plutôt que
    // distribuée en volume : une passe décisive n'existe pas sans le panier qu'elle
    // amène, et c'est ce lien qui rend le total plausible sans qu'on le règle.
    const passeurs = onCourtIds.filter((id) => id !== playerId)
    if (k % 2 === 0 && passeurs.length > 0)
      out.push(ev({ type: 'STAT', team: 'A', playerId: r.assist.prochain(passeurs), stat: 'assist', period, gameClock: clock() }))

    if (k % 3 === 2) {
      const missed = SPOTS_2[(i2 + 3) % SPOTS_2.length]
      out.push(ev({ type: 'MISS', team: 'A', playerId, kind: kindAt(missed.x, missed.y), shot: missed, period, gameClock: clock() }))
    }
  }
  // Le point impair : un lancer franc, pour le joueur que le répartiteur sert
  // ensuite — c'est celui qui attaque le plus le cercle qu'on envoie sur la ligne.
  if (nLf) out.push(ev({ type: 'SCORE', team: 'A', playerId: r.basket.prochain(onCourtIds), kind: 'lf' as ScoreKind, period, gameClock: clock() }))
  return out
}

/**
 * Le reste de la feuille de match, période par période : rebonds, contres et fautes,
 * pour les seuls joueurs présents sur le terrain à cet instant.
 *
 * Il n'y en avait quasiment rien : une seule statistique par joueur et par période,
 * choisie par l'**indice** du joueur dans le cinq — si bien qu'un joueur donné
 * recevait toujours la même, que les contres n'allaient qu'au quatrième de la liste,
 * et qu'aucune faute n'était jamais saisie. Trois colonnes de la feuille de match
 * étaient vides sur toutes les rencontres, et le compteur de fautes d'équipe restait
 * à zéro d'un bout à l'autre.
 */
function secondaires(clock: () => number, period: Period, onCourtIds: string[], r: Repartition): GameEvent[] {
  const out: GameEvent[] = []
  for (const [stat, combien] of PAR_PERIODE)
    for (let k = 0; k < combien; k++)
      out.push(ev({ type: 'STAT', team: 'A', playerId: r[stat].prochain(onCourtIds), stat, period, gameClock: clock() }))

  const fautes = FAUTES_PAR_PERIODE[(period - 1) % FAUTES_PAR_PERIODE.length]
  for (let k = 0; k < fautes; k++) {
    // Le plafond est appliqué en **retirant** le joueur des candidats, et non en
    // sautant l'évènement : sauter ferait perdre une faute au compteur d'équipe, qui
    // doit atteindre le bonus à la période prévue.
    const eligibles = onCourtIds.filter((id) => r.faute.count(id) < MAX_FAUTES)
    if (eligibles.length === 0) break
    const playerId = r.faute.prochain(eligibles)
    out.push(ev({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId }, foulType: 'personal', period, gameClock: clock() }))
  }
  return out
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

/** Le cinq majeur, désigné par numéros de maillot et non par rang dans la liste :
 *  un coach dit « le 2, le 11, le 13, le 15 et le 17 ». */
const STARTERS = [2, 11, 13, 15, 17].map(parNumero)
/**
 * Les rotations, par période : `[numéro sortant, numéro entrant]`.
 *
 * Les titulaires **reviennent**. La version précédente sortait un titulaire par
 * période sans jamais le rappeler : à la fin du match les cinq majeurs avaient
 * quelques minutes et leurs remplaçants tout le reste, si bien que le meneur
 * titulaire finissait à huit points et un remplaçant à cinquante et un. Un
 * changement double sur un même arrêt de jeu est parfaitement réglementaire, et
 * c'est ce qui permet de faire tourner dix joueurs sur onze en gardant aux
 * titulaires le plus de temps de jeu — ce que `playingTimes` sait mesurer.
 */
const SUB_SWAPS: [number, number][][] = [
  [[2, 5]],                     // le meneur souffle
  [[5, 2], [17, 10]],           // il revient, l'intérieur souffle
  [[10, 17], [15, 20]],         // et ainsi de suite
  [[20, 15], [11, 6], [13, 7]], // dernier quart : on fait tourner l'aile
]

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
function periodEvents(p: Period, pointsA: number, pointsB: number, onCourtBefore: string[], swaps: [number, number][] | undefined, stopClock: number, r: Repartition): { events: GameEvent[]; onCourtAfter: string[] } {
  let c = 600
  const clock = () => (c = Math.max(stopClock, c - 5))
  const half = Math.round(pointsA / 2)
  const events = [...baskets(half, clock, p, onCourtBefore, r)]
  let onCourtAfter = onCourtBefore
  if (swaps?.length) {
    // Tous les changements de la période au même arrêt de jeu, au milieu exact du
    // temps : c'est cette valeur de chrono que `playingTimes` lit, pas le nombre de
    // paniers déjà écoulés.
    c = Math.round((600 + stopClock) / 2)
    for (const [out, into] of swaps) {
      events.push(ev({ type: 'SUBSTITUTION', team: 'A', playerOutId: parNumero(out), playerInId: parNumero(into), period: p, gameClock: c }))
      onCourtAfter = onCourtAfter.map((id) => (id === parNumero(out) ? parNumero(into) : id))
    }
  }
  events.push(
    ...baskets(pointsA - half, clock, p, onCourtAfter, r),
    ...opponentBaskets(pointsB, clock, p),
    ...secondaires(clock, p, onCourtAfter, r),
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

interface Fixture { opponent: number; date: string; time: string; status: 'finished' | 'live' | 'setup'; score: [number, number] }
/**
 * Nos cinq rencontres : trois jouées et gagnées, une en direct, une à venir.
 *
 * Les scores sont écrits en clair et non calculés par une formule modulo. Ils
 * doivent produire un classement précis — l'Avenir de Vignot en tête — et une
 * formule ne se pilote pas : elle donnait 2V-1D et un différentiel de −2.
 *
 * Pour la rencontre en direct, `score` est le total visé sur quatre périodes ; seules
 * deux sont jouées, donc l'écran en montre à peu près la moitié.
 */
const FIXTURES: Fixture[] = [
  { opponent: 1, date: JOURNEES[0], time: '20:30', status: 'finished', score: [78, 71] },
  { opponent: 2, date: JOURNEES[1], time: '20:00', status: 'finished', score: [72, 64] },
  { opponent: 3, date: JOURNEES[2], time: '18:30', status: 'finished', score: [81, 69] },
  { opponent: 4, date: JOURNEES[3], time: '20:30', status: 'live', score: [82, 70] },
  { opponent: 5, date: JOURNEES[4], time: '18:30', status: 'setup', score: [0, 0] },
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
  const [sa, sb] = f.score
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
    // Les répartiteurs sont créés ici, donc détenus par la rencontre : la
    // proportionnalité se joue sur le match, pas sur chaque segment de cinq paniers.
    const r = nouvelleRepartition()
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
interface OutsideGame { home: number; away: number; date: string; score: [number, number] }
/**
 * Les confrontations entre nos cinq adversaires, sur les **trois journées jouées**
 * seulement — jamais celle du jour ni la suivante.
 *
 * C'est ce qui rendait le classement incohérent : le seed publiait les résultats des
 * cinq journées, si bien que les autres équipes affichaient quatre ou cinq matchs
 * quand nous en avions trois. Or le classement FFBB compte des points absolus
 * (V=2, D=1) : à trois rencontres nous plafonnons à six points, tandis qu'une équipe
 * à cinq rencontres en a au moins cinq et jusqu'à dix. Être premier était
 * arithmétiquement impossible. Et publier les résultats de la journée en cours n'est
 * de toute façon pas ce qu'on observe dans un championnat.
 *
 * Chacun joue donc trois rencontres, comme nous. Les scores sont choisis pour que
 * personne n'atteigne nos six points : `standings.test.ts` et le test du seed
 * vérifient le classement obtenu.
 */
const OUTSIDE_GAMES: OutsideGame[] = [
  { home: 2, away: 3, date: JOURNEES[0], score: [74, 68] },
  { home: 4, away: 5, date: JOURNEES[0], score: [80, 72] },
  { home: 1, away: 4, date: JOURNEES[1], score: [77, 70] },
  { home: 3, away: 5, date: JOURNEES[1], score: [65, 73] },
  { home: 1, away: 5, date: JOURNEES[2], score: [82, 75] },
  { home: 2, away: 4, date: JOURNEES[2], score: [69, 76] },
]

function buildResult(g: OutsideGame, idx: number): ReportedResult {
  const [homeScore, awayScore] = g.score
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
type Mvt = [Side, Position, number, number]

/** Une flèche, écrite comme on la lit : qui, quel trait, par où elle passe. */
const fl = (position: Position, stroke: Stroke, points: [number, number][]): Arrow =>
  ({ from: { side: 'offense', position }, stroke, points: points.map(([x, y]) => ({ x, y })) })

/** Un temps de la démonstration : ce qui bouge, à qui est le ballon, ce qui se trace. */
interface Etape { deplace?: Mvt[]; ball?: Step['ball']; arrows?: Arrow[] }

/**
 * Un schéma de démonstration : on part de la mise en place du domaine, puis
 * chaque étape hérite du temps précédent (`tempsSuivant` : positions et ballon,
 * jamais les flèches) et n'écrit que ce qui change. Les flèches d'un temps
 * mènent là où les pions se trouvent au temps suivant — sans quoi le coach lit
 * une combinaison qui ne se joue pas.
 */
function schemaDemo(
  idx: number, clubId: string, name: string, note: string, folder: string,
  court: Court, defense: boolean, etapes: Etape[],
): Play {
  const base = newPlay(clubId, court, defense)
  let t = base.steps[0]
  const steps = etapes.map((e, i) => {
    t = i === 0 ? t : nextStep(t)
    for (const [side, position, x, y] of e.deplace ?? []) {
      const pion = t.markers.find((p) => p.side === side && p.position === position)
      if (pion) pion.at = { x, y }
    }
    if (e.ball) t.ball = e.ball
    t.arrows = e.arrows ?? []
    return t
  })
  return { ...base, id: `seed-sch${idx}`, name, note, folder, steps }
}

function buildSchemas(clubId: string): Play[] {
  return [
    // Le classique du haut : le 5 monte prendre l'écran, le 1 tourne autour par
    // l'extérieur, le 5 plonge dans le dos de son défenseur et reçoit.
    schemaDemo(0, clubId, 'Pick and roll haut', 'Écran du 5 au sommet, le 1 tourne autour, passe au 5 qui plonge.', 'Attaque placée', 'half', true, [
      {
        deplace: [
          ['offense', 1, 0.50, 0.66], ['offense', 2, 0.05, 0.16], ['offense', 3, 0.95, 0.16],
          ['offense', 4, 0.16, 0.46], ['offense', 5, 0.68, 0.38],
          ['defense', 1, 0.50, 0.55], ['defense', 2, 0.15, 0.16], ['defense', 3, 0.85, 0.16],
          ['defense', 4, 0.24, 0.40], ['defense', 5, 0.63, 0.32],
        ],
        arrows: [fl(5, 'screen', [[0.68, 0.38], [0.63, 0.52], [0.585, 0.625]])],
      },
      {
        // L'écran est posé contre l'épaule droite du porteur ; le défenseur du 5
        // recule à hauteur de la raquette (il ne sort pas au contact), celui du 1
        // reste sur ses appuis.
        deplace: [['offense', 5, 0.585, 0.625], ['defense', 5, 0.635, 0.495], ['defense', 1, 0.50, 0.56]],
        arrows: [fl(1, 'dribble', [[0.50, 0.66], [0.60, 0.685], [0.685, 0.575], [0.70, 0.44]])],
      },
      {
        // Le 1 est ressorti côté droit, son défenseur le poursuit ; celui du 5 est
        // resté haut, la voie du plongeon est ouverte.
        deplace: [['offense', 1, 0.70, 0.44], ['defense', 1, 0.73, 0.57], ['defense', 5, 0.60, 0.52]],
        arrows: [
          fl(5, 'cut', [[0.585, 0.625], [0.55, 0.42], [0.52, 0.21]]),
          fl(1, 'pass', [[0.70, 0.44], [0.63, 0.34], [0.555, 0.255]]),
        ],
      },
      {
        // La finition, jouée et non plus seulement dessinée : le 5 arrive au bout
        // de sa course (là où menait sa flèche du temps précédent) et reçoit la
        // passe. Son défenseur, resté haut sur l'écran, ne le rattrape pas ; celui
        // du 1 reste collé au porteur qui vient de lâcher le ballon.
        deplace: [['offense', 5, 0.52, 0.21], ['defense', 5, 0.565, 0.37], ['defense', 1, 0.71, 0.51]],
        ball: { side: 'offense', position: 5 },
      },
    ]),

    // Renversement d'un côté à l'autre : le 4 sort du poste bas et va prendre le
    // corner, le ballon y arrive par l'aile.
    schemaDemo(1, clubId, 'Corner pour le 4', 'Le 4 sort du poste bas vers le corner, le ballon suit par l’aile.', 'Attaque placée', 'half', false, [
      {
        deplace: [
          ['offense', 1, 0.50, 0.64], ['offense', 2, 0.82, 0.46], ['offense', 3, 0.18, 0.46],
          ['offense', 4, 0.31, 0.21], ['offense', 5, 0.66, 0.36],
        ],
        arrows: [
          fl(1, 'pass', [[0.50, 0.64], [0.34, 0.55], [0.19, 0.47]]),
          fl(4, 'cut', [[0.31, 0.21], [0.22, 0.15], [0.06, 0.135]]),
        ],
      },
      {
        // Le ballon a changé de main : c'est le 3 qui sert le corner, et le 5
        // traverse la raquette pour le rebond du côté du tir.
        deplace: [['offense', 4, 0.06, 0.135]],
        ball: { side: 'offense', position: 3 },
        arrows: [
          fl(3, 'pass', [[0.18, 0.46], [0.10, 0.30], [0.065, 0.17]]),
          fl(5, 'cut', [[0.66, 0.36], [0.60, 0.22], [0.44, 0.17]]),
        ],
      },
    ]),

    // Remise en jeu en boîte, sur terrain complet : le remetteur est derrière la
    // ligne de fond et le ballon attend au sol tant que l'arbitre ne l'a pas donné.
    schemaDemo(2, clubId, 'Remise ligne de fond', 'Boîte à quatre : écran du 5, le 3 coupe au panier, le 4 assure derrière.', 'Remises en jeu', 'full', false, [
      {
        deplace: [
          ['offense', 1, 0.62, 0.025], ['offense', 2, 0.36, 0.20], ['offense', 3, 0.64, 0.20],
          ['offense', 4, 0.64, 0.09], ['offense', 5, 0.36, 0.09],
        ],
        // Le ballon attend au sol, à l'écart du remetteur : posé sur la ligne, il
        // ne doit pas se lire comme un ballon déjà en main.
        ball: { x: 0.82, y: 0.035 },
        arrows: [
          fl(5, 'screen', [[0.36, 0.09], [0.47, 0.13], [0.565, 0.165]]),
          fl(3, 'cut', [[0.64, 0.20], [0.585, 0.135], [0.50, 0.09]]),
          fl(2, 'cut', [[0.36, 0.20], [0.20, 0.145], [0.065, 0.085]]),
          // Le 4 remonte en sécurité vers la ligne médiane : sans lui, une perte
          // de balle sur la remise part seule au panier. Sa course contourne le 3
          // par l'extérieur plutôt que de lui passer dessus.
          fl(4, 'cut', [[0.64, 0.09], [0.73, 0.22], [0.60, 0.41]]),
        ],
      },
      {
        // Le ballon est en main : la remise part vers le 3, sorti de l'écran du 5.
        deplace: [['offense', 2, 0.065, 0.085], ['offense', 3, 0.50, 0.09], ['offense', 4, 0.60, 0.41], ['offense', 5, 0.565, 0.165]],
        ball: { side: 'offense', position: 1 },
        arrows: [fl(1, 'pass', [[0.62, 0.025], [0.57, 0.055], [0.505, 0.085]])],
      },
    ]),
  ]
}

/** Le message du coach, daté d'il y a deux jours : le tableau de bord doit
 *  montrer l'encart ET son âge sans rien saisir, et deux jours restent du côté
 *  frais de la bascule à l'ambre (quinze jours). */
function buildMessage(): TeamMessage {
  return {
    clubId: teamId(0),
    text: 'Pas d’entraînement mardi, le gymnase est fermé. Pensez au maillot blanc pour samedi.',
    writtenAt: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
  }
}

/**
 * Une empreinte des tables déclaratives du seed. Toute retouche de l'effectif, des
 * poids de marque, du cinq majeur, des rotations, de nos scores ou des résultats
 * extérieurs la fait changer — donc régénère les données sans qu'on ait à y penser.
 *
 * Les **dates** en sont exclues à dessein : elles sont ancrées sur le jour du seed,
 * si bien que les inclure ferait tout régénérer chaque nuit et effacerait ce qu'un
 * développeur a saisi la veille.
 *
 * Le hachage est un djb2 en base 36 : on ne cherche pas à résister à une collision
 * malveillante, seulement à repérer qu'une constante a bougé.
 */
export function empreinte(value: unknown): string {
  const text = JSON.stringify(value)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export const EMPREINTE_DONNEES = empreinte([
  EFFECTIF, TEAMS, POIDS, THEMES,
  ROLES, POIDS_STAT, PAR_PERIODE, FAUTES_PAR_PERIODE, MAX_FAUTES,
  SPOTS_2, SPOTS_3,
  [2, 11, 13, 15, 17], SUB_SWAPS,
  FIXTURES.map((f) => [f.opponent, f.time, f.status, f.score]),
  OUTSIDE_GAMES.map((g) => [g.home, g.away, g.score]),
])
const SEED_VERSION = `${SEED_DATA_VERSION}-${EMPREINTE_DONNEES}`

export async function seedDevData(): Promise<void> {
  const already = (await db.teams.count()) > 0
  if (already && localStorage.getItem('seed-version') === SEED_VERSION) return
  // Re-seed (schéma/données de démo mis à jour). Convocations et entraînements
  // aussi : sans quoi un re-seed laisserait des orphelins rattachés à des
  // rencontres qui n'existent plus.
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
  // L'Avenir de Vignot est le club de démonstration : sans cela, la démo s'ouvre
  // sur l'écran de bienvenue à chaque régénération des données.
  if (!localStorage.getItem(CLUB_ID_KEY)) localStorage.setItem(CLUB_ID_KEY, teamId(0))
}
