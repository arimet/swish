import { list, get, mutate, type Op } from './api'
import { hasEvents } from '../domain/cleanup'
import type { Team, Player, Match, ReportedResult, Convocation, Training, TeamMessage } from '../domain/types'
import type { Play } from '../domain/plays'

/*
 * Reads and writes, straight to the database. There is nothing between this file
 * and `api/`: no mirror to keep in step, no queue to flush, no cascade that can be
 * forgotten on one of the two sides.
 *
 * TWO THINGS TO KNOW BEFORE TOUCHING ANY OF IT.
 *
 * **A cascade is one batch.** Deleting a team takes its players, its results, its
 * sessions, its plays and its message; deleting a player takes them out of the
 * call-ups; deleting a play takes it out of the sessions that cited it. Each of
 * those goes out as a single `mutate` call, hence a single transaction: a
 * half-applied cascade would leave the club in a state no screen can describe.
 *
 * **A write replaces**, every kind alike, the match sheet included: `api/mutate`
 * applies the document that arrives and keeps nothing of the one stored. So what a
 * screen sends is what the database will hold — which is only safe because the
 * screen read that document from the database in the first place.
 *
 * The lists are club-sized — a roster, a season's fixtures — so filtering in memory
 * is cheaper than teaching the API a query language it would use twice.
 */

const one = (kind: Op['kind'], id: string, doc: unknown): Promise<void> => mutate([{ kind, op: 'put', id, doc }])
const gone = (kind: Op['kind'], id: string): Promise<void> => mutate([{ kind, op: 'del', id }])

/**
 * Runs the cascades one after another, never two at once.
 *
 * A cascade reads before it writes — the sessions that cite a play, the call-ups that
 * name a player — and two of them launched together both read the *same* state: the
 * second write then reinstates the id the first had just removed, and the debris stays
 * for good. That defect shipped once; `cascade.test.ts` and `repositories.test.ts`
 * both keep a "two deletions in quick succession" case for it.
 *
 * ponytail: the chain is per tab, so two devices deleting at the same instant can
 * still cross. The fix for that lives server-side (prune inside the SQL), and it is
 * worth writing the day a club reports it, not before.
 */
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(f: () => Promise<T>): Promise<T> {
  const next = chain.then(f, f)
  // The chain must survive a failed cascade, or one network hiccup would jam every
  // later deletion in the tab.
  chain = next.then(() => undefined, () => undefined)
  return next
}

export const saveTeam = (t: Team) => one('team', t.id, t)
export const getTeam = (id: string) => get<Team>('team', id)
export const listTeams = () => list<Team>('team')

/** Deletes a team, its players, and the hand-entered results that mention it (on
 *  either side): a result whose team no longer exists has no meaning left, so we
 *  delete it rather than let it haunt the standings under its raw id. Trainings,
 *  plays and the coach's message belong to the club too — left behind, they would
 *  sit in the database under a `clubId` that will never come back, hence invisible
 *  on every screen and impossible to delete. */
export const deleteTeam = (id: string) => serial(async () => {
  const [players, results, trainings, plays] = await Promise.all([
    list<Player>('player'), list<ReportedResult>('result'), list<Training>('training'), list<Play>('play'),
  ])
  await mutate([
    ...players.filter((p) => p.teamId === id).map((p): Op => ({ kind: 'player', op: 'del', id: p.id })),
    ...results.filter((r) => r.homeId === id || r.awayId === id).map((r): Op => ({ kind: 'result', op: 'del', id: r.id })),
    ...trainings.filter((t) => t.clubId === id).map((t): Op => ({ kind: 'training', op: 'del', id: t.id })),
    ...plays.filter((s) => s.clubId === id).map((s): Op => ({ kind: 'play', op: 'del', id: s.id })),
    { kind: 'message', op: 'del', id },
    { kind: 'team', op: 'del', id },
  ])
})

export const savePlayer = (p: Player) => one('player', p.id, p)
export const getPlayer = (id: string) => get<Player>('player', id)
export const listPlayers = async (teamId: string) => (await list<Player>('player')).filter((p) => p.teamId === teamId)
/** Deletes a player and removes them from every call-up that mentions them: without
 *  this cascade a call-up would keep a player who no longer exists, impossible to
 *  untick, and would skew the count shown on the game sheet. */
export const deletePlayer = (id: string) => serial(async () => {
  const convocations = (await list<Convocation>('convocation')).filter((c) => c.playerIds.includes(id))
  await mutate([
    { kind: 'player', op: 'del', id },
    ...convocations.map((c): Op => ({
      kind: 'convocation', op: 'put', id: c.matchId,
      doc: { ...c, playerIds: c.playerIds.filter((pid) => pid !== id) },
    })),
  ])
})

export const saveMatch = (m: Match) => one('match', m.id, m)
export const getMatch = (id: string) => get<Match>('match', id)
export const listMatches = () => list<Match>('match')
/** Deletes the game and its call-up: a call-up without a game makes no sense, and
 *  would otherwise stay invisible and immovable. */
export const deleteMatch = (id: string) => mutate([
  { kind: 'match', op: 'del', id },
  { kind: 'convocation', op: 'del', id },
])

export const listResults = () => list<ReportedResult>('result')
export const saveResult = (r: ReportedResult) => one('result', r.id, r)
export const deleteResult = (id: string) => gone('result', id)

/** The call-up is filed under **the game** rather than under an id of its own:
 *  there is one per game, and writing on that key makes replacement free. */
export const getConvocation = (matchId: string) => get<Convocation>('convocation', matchId)
export const saveConvocation = (c: Convocation) => one('convocation', c.matchId, c)

export const listTrainings = () => list<Training>('training')
export const saveTraining = (t: Training) => one('training', t.id, t)
export const deleteTraining = (id: string) => gone('training', id)

/** The coach's message to the team: one per club, filed **under the club**, which
 *  therefore serves as its key. Writing a new one replaces the previous, and
 *  deleting the team takes it along (cf. `deleteTeam`). */
export const getMessage = (clubId: string) => get<TeamMessage>('message', clubId)
export const saveMessage = (m: TeamMessage) => one('message', m.clubId, m)
export const deleteMessage = (clubId: string) => gone('message', clubId)

/** Attaches a play to a training session, or detaches it. Ids that no longer name
 *  any play are dropped along the way — the same guard as the read, applied here to
 *  the write.
 *
 *  ponytail: read-modify-write, so two boxes ticked within the same round trip lose
 *  the first tick. One coach, one phone, one session: a per-field API endpoint would
 *  cost more than the defect it prevents. */
export const toggleTrainingPlay = (trainingId: string, playId: string) => serial(async () => {
  const [training, plays] = await Promise.all([get<Training>('training', trainingId), list<Play>('play')])
  if (!training) return
  const ids = training.playIds ?? []
  const next = ids.includes(playId) ? ids.filter((id) => id !== playId) : [...ids, playId]
  const alive = new Set(plays.map((s) => s.id))
  await one('training', training.id, { ...training, playIds: next.filter((id) => alive.has(id)) })
})

/** The playbook belongs to the club. */
export const listPlays = async (clubId: string) => (await list<Play>('play')).filter((s) => s.clubId === clubId)
export const getPlay = (id: string) => get<Play>('play', id)
/** Stamps the time on save: without `updatedAt` the library would only have the
 *  database's order, which is to say none, and would look shuffled at every
 *  opening. */
export const savePlay = (s: Play) => {
  const written = { ...s, updatedAt: new Date().toISOString() }
  return one('play', written.id, written)
}
/** Deletes a play and removes it from the trainings that cited it: an orphan id
 *  would skew the count shown on the session. */
export const deletePlay = (id: string) => serial(async () => {
  const sessions = (await list<Training>('training')).filter((t) => t.playIds?.includes(id))
  await mutate([
    { kind: 'play', op: 'del', id },
    ...sessions.map((t): Op => ({
      kind: 'training', op: 'put', id: t.id,
      doc: { ...t, playIds: t.playIds!.filter((pid) => pid !== id) },
    })),
  ])
})

// ── Administrative cleanup ──────────────────────────────────────────────────
// Bulk, irreversible deletions, and they now reach the shared database rather than
// one device: what is erased here is erased for everyone. `Admin.tsx` says so before
// asking for a confirmation.

/** Deletes the games matching the filter and their call-ups — the same cascade as
 *  `deleteMatch`, applied in bulk. Returns the deleted ids, enough to report what
 *  actually disappeared. */
export const deleteMatchesWhere = async (filter: (m: Match) => boolean): Promise<string[]> => {
  const ids = (await listMatches()).filter(filter).map((m) => m.id)
  await mutate(ids.flatMap((id): Op[] => [
    { kind: 'match', op: 'del', id },
    { kind: 'convocation', op: 'del', id },
  ]))
  return ids
}

/** Empties a club's game sheets: the recorded events go, the game, its date and its
 *  call-up stay. The status drops back to "upcoming" — a "finished" game without a
 *  single event would show 0–0 everywhere, like a score actually observed. */
export const clearClubStats = async (clubId: string): Promise<number> => {
  const cleared = (await listMatches()).filter(hasEvents(clubId)).map((m) => ({ ...m, events: [], status: 'setup' as const }))
  await mutate(cleared.map((m): Op => ({ kind: 'match', op: 'put', id: m.id, doc: m })))
  return cleared.length
}

/** The hand-entered results, in bulk. No cascade: nothing references them. */
export const deleteAllResults = async () => {
  const ids = (await listResults()).map((r) => r.id)
  await mutate(ids.map((id): Op => ({ kind: 'result', op: 'del', id })))
}

/** A club's trainings, in bulk. Their `playIds` go with them: sessions cite plays,
 *  never the other way round. */
export const deleteTrainingsOfClub = async (clubId: string) => {
  const ids = (await listTrainings()).filter((t) => t.clubId === clubId).map((t) => t.id)
  await mutate(ids.map((id): Op => ({ kind: 'training', op: 'del', id })))
}

/** A club's plays, in bulk, and their ids removed from the sessions that cited them
 *  — the same cascade as `deletePlay`, otherwise the cleanup would leave orphan ids
 *  behind in the trainings it kept. */
export const deletePlaysOfClub = (clubId: string) => serial(async () => {
  const [plays, trainings] = await Promise.all([list<Play>('play'), listTrainings()])
  const removed = new Set(plays.filter((s) => s.clubId === clubId).map((s) => s.id))
  await mutate([
    ...[...removed].map((id): Op => ({ kind: 'play', op: 'del', id })),
    ...trainings.filter((t) => t.playIds?.some((pid) => removed.has(pid))).map((t): Op => ({
      kind: 'training', op: 'put', id: t.id,
      doc: { ...t, playIds: t.playIds!.filter((pid) => !removed.has(pid)) },
    })),
  ])
})

/** Empties the database. Every kind, every document, one transaction — there is no
 *  device-local copy left to spare, so this is exactly as final as it sounds. */
export const wipeAll = async () => {
  const kinds: Op['kind'][] = ['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message']
  // The key is not always `id`: a call-up is filed under its game, the message under
  // its club. Each kind therefore says which field to delete it by.
  const keyOf: Record<Op['kind'], (d: Record<string, string>) => string> = {
    team: (d) => d.id, player: (d) => d.id, match: (d) => d.id, result: (d) => d.id,
    convocation: (d) => d.matchId, training: (d) => d.id, play: (d) => d.id, message: (d) => d.clubId,
  }
  const batches = await Promise.all(kinds.map(async (kind) =>
    (await list<Record<string, string>>(kind)).map((d): Op => ({ kind, op: 'del', id: keyOf[kind](d) }))))
  await mutate(batches.flat())
}
