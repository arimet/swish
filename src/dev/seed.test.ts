import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DATA_FINGERPRINT, fingerprint, seedDevData } from './seed'
import { db } from '../persistence/db'
import { getConvocation, listMatches, listPlayers, listPlays, listResults, listTeams, listTrainings, saveConvocation, savePlayer, saveTraining } from '../persistence/repositories'
import { playingTimes } from '../domain/playingtime'
import { nextFixture } from '../domain/fixtures'
import { folders } from '../domain/plays'
import { standings } from '../domain/standings'
import { playerStats } from '../domain/boxscore'
import { TEAM_FOUL_BONUS } from '../rules/ffbb'

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear()
  await seedDevData()
})

describe('demo data', () => {
  it('creates only the teams that play', async () => {
    const teams = await listTeams()
    const matches = await listMatches()
    const utilisees = new Set(matches.flatMap((m) => [m.meta.clubId, m.meta.opponentId]))
    expect(teams.every((t) => utilisees.has(t.id))).toBe(true)
  })

  it('creates no opposition roster', async () => {
    const matches = await listMatches()
    const adversaires = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of adversaires) expect(await listPlayers(id)).toHaveLength(0)
  })

  it('produces rotations, hence credible court time', async () => {
    const joue = (await listMatches()).find((m) => m.status === 'finished')!
    const steps = [...playingTimes(joue).values()].filter((t) => t > 0)
    // Without SUBSTITUTION, only the five starters would have court time.
    expect(steps.length).toBeGreaterThan(5)
  })

  it('puts Avenir de Vignot on top, on an equal number of games played', async () => {
    // FFBB standings count absolute points (W=2, L=1): being top therefore requires
    // having played as many games as the others. The seed published the results of all
    // five matchdays while we only have three played, which made first place
    // arithmetically unreachable — hence the game count checked here, and not only the
    // rank.
    const [matches, results, teams] = await Promise.all([listMatches(), listResults(), listTeams()])
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
    const lines = standings(matches, results, byId)[0].lines
    expect(lines[0].name).toBe('AVENIR DE VIGNOT')
    expect(lines[0].v).toBe(3)
    expect(lines[0].d).toBe(0)
    expect(new Set(lines.map((l) => l.j))).toEqual(new Set([3]))
    // And top outright: a tie on points broken by the differential would rest on the
    // luck of the scores, not on an intention.
    expect(lines[0].pts).toBeGreaterThan(lines[1].pts)
  })

  it('the starting five is the one the coach named', async () => {
    const matches = await listMatches()
    const players = await listPlayers(matches[0].meta.clubId)
    const cinq = new Set([2, 11, 13, 15, 17])
    const match = matches.find((m) => m.events.some((e) => e.type === 'STARTING_FIVE'))!
    const ev = match.events.find((e) => e.type === 'STARTING_FIVE') as Extract<typeof match.events[number], { type: 'STARTING_FIVE' }>
    const numeros = ev.playerIds.map((id) => players.find((p) => p.id === id)!.number)
    expect(new Set(numeros)).toEqual(cinq)
  })

  it('distributes the baskets plausibly: BUZZI in front, a credible match sheet', async () => {
    // Trois tentatives ratées avant celle-ci, toutes invisibles sans mesure.
    // The weighted list grouped by player: `k % length` never left the first block,
    // and one player took every basket (202 points for a substitute). Interleaved: we
    // never got past the first two rounds, so the weights changed nothing. And the
    // allocation counter reset on each of a game's eight segments: the lowest weight was
    // never
    // servi, un titulaire finissait à zéro.
    const matches = await listMatches()
    const players = await listPlayers(matches[0].meta.clubId)
    const joues = matches.filter((m) => m.status === 'finished')
    const parJoueur = new Map<string, number>()
    let total = 0
    for (const m of joues) {
      for (const s of playerStats(m)) {
        parJoueur.set(s.playerId, (parJoueur.get(s.playerId) ?? 0) + s.points)
        total += s.points
      }
    }
    const numero = (id: string) => players.find((p) => p.id === id)!.number
    const classe = [...parJoueur.entries()].sort((a, b) => b[1] - a[1])

    // The top scorer is the one the coach named.
    expect(numero(classe[0][0])).toBe(11)
    // He dominates without crushing: a quarter of the team's points is already a lot.
    expect(classe[0][1] / total).toBeLessThan(0.25)
    // And the gap from first to last scorer stays that of a match sheet, not that of
    // an aberration: a ratio of ten meant the weights
    // étaient trop écartés.
    const marqueurs = classe.filter(([, pts]) => pts > 0)
    expect(classe[0][1] / marqueurs[marqueurs.length - 1][1]).toBeLessThan(7)
    // The bench scores: an allocation that does not reach it is broken.
    expect(marqueurs.length).toBeGreaterThanOrEqual(9)
    // The starting five stay ahead overall — a productive sixth man may pass the fifth
    // starter, as happens in a real team.
    const cinq = new Set([2, 11, 13, 15, 17])
    expect(classe.slice(0, 5).filter(([id]) => cinq.has(numero(id))).length).toBeGreaterThanOrEqual(4)
  })

  /**
   * The whole match sheet, and not only its points column.
   *
   * Three columns were empty in **every** game — 3PT, BLK, PF — and nothing said so.
   * The three-point spots existed in the seed but were unreachable (`k % length` over
   * a list of nine, with five baskets per segment); blocks only went to the fourth
   * player of the five, because the statistic was chosen by the player's index; and no
   * foul was ever recorded, so the team counter stayed at zero throughout.
   *
   * This test measures the five categories. It has no fine realism requirement — the
   * weights are invented and can be corrected from the application — but it refuses
   * zero, which is the one value we know to be wrong.
   */
  it('fills the whole match sheet: threes, assists, rebounds, blocks, fouls', async () => {
    const matches = await listMatches()
    const players = await listPlayers(matches[0].meta.clubId)
    const numero = (id: string) => players.find((p) => p.id === id)!.number
    const joues = matches.filter((m) => m.status === 'finished')
    expect(joues.length).toBeGreaterThan(0)

    for (const m of joues) {
      const stats = playerStats(m)
      const somme = (lire: (s: (typeof stats)[number]) => number) => stats.reduce((t, s) => t + lire(s), 0)

      // A three is derived from its spot, never declared: a non-zero column therefore
      // also proves that the seed's spots really do fall behind the line, which no
      // assertion had to repeat by hand.
      expect(somme((s) => s.threes)).toBeGreaterThan(3)
      expect(somme((s) => s.assists)).toBeGreaterThan(10)
      expect(somme((s) => s.defRebounds)).toBeGreaterThan(somme((s) => s.offRebounds))
      expect(somme((s) => s.blocks)).toBeGreaterThan(0)
      expect(somme((s) => s.fouls)).toBeGreaterThan(10)

      // Nobody fouls out: an excluded player leaves the court, while the seed's
      // rotations still count them present.
      expect(stats.every((s) => s.fouls < 5)).toBe(true)

      // The roles must read in the figures, otherwise the per-category weights serve
      // no purpose: the best passer is a guard, the best rebounder a big. That is what
      // was missing when the statistic followed the player's index in the five.
      const best = (lire: (s: (typeof stats)[number]) => number) =>
        numero([...stats].sort((a, b) => lire(b) - lire(a))[0].playerId)
      expect([2, 5]).toContain(best((s) => s.assists))
      expect([15, 17, 20, 8]).toContain(best((s) => s.defRebounds))
    }

    // The composed total lands **exactly** on the scores announced. The seed now
    // composes each segment from shots of three different values; a wrong decomposition
    // would read as a scoreboard bug, not as a seed bug.
    const totaux = joues.map((m) => playerStats(m).reduce((t, s) => t + s.points, 0)).sort((a, b) => a - b)
    expect(totaux).toEqual([72, 78, 81])

    // At least one period reaches the bonus (five team fouls under FFBB rules, not
    // four as in the NBA): the demo must be able to show the pill.
    const parPeriode = new Map<number, number>()
    for (const e of joues[0].events)
      if (e.type === 'FOUL' && e.team === 'A') parPeriode.set(e.period, (parPeriode.get(e.period) ?? 0) + 1)
    expect(Math.max(...parPeriode.values())).toBeGreaterThanOrEqual(TEAM_FOUL_BONUS)
  })

  it('creates outside results so that the standings make sense', async () => {
    const results = await listResults()
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    // Aucun résultat saisi ne doit concerner notre club : nos rencontres font foi.
    expect(results.every((r) => r.homeId !== clubId && r.awayId !== clubId)).toBe(true)
    // Chaque adversaire doit avoir joué contre plusieurs équipes, pas seulement contre nous.
    const adversaires = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of adversaires) {
      const rencontres = results.filter((r) => r.homeId === id || r.awayId === id).length
      expect(rencontres).toBeGreaterThanOrEqual(2)
    }
  })

  it('produces no draw (a basketball game never ends level)', async () => {
    const results = await listResults()
    expect(results.every((r) => r.homeScore !== r.awayScore)).toBe(true)
  })

  it('creates trainings for our club, in the game weeks', async () => {
    const trainings = await listTrainings()
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    expect(trainings.length).toBeGreaterThan(0)
    // Without a clubId, a training would leak into any other club's calendar.
    expect(trainings.every((t) => t.clubId === clubId)).toBe(true)
  })

  it('puts the demo call-up on the upcoming game, never on one already played', async () => {
    const matches = await listMatches()
    const aVenir = matches.find((m) => m.status === 'setup')!
    const convocation = await getConvocation(aVenir.id)
    expect(convocation?.playerIds.length).toBeGreaterThan(0)
    for (const jouee of matches.filter((m) => m.status === 'finished')) {
      expect(await getConvocation(jouee.id)).toBeUndefined()
    }
  })

  it('the next fixture right after a seed is the game called up, not a training', async () => {
    // The last matchday's trainings are placed after the game (not before, as on the
    // other matchdays): otherwise, being closer in time than the game called up, they
    // would hide the "called up" block for days after a seed — precisely when the demo
    // is being looked at.
    const matches = await listMatches()
    const trainings = await listTrainings()
    const aVenir = matches.find((m) => m.status === 'setup')!
    // As on the dashboard (`Dashboard.tsx`): the live game already occupies the
    // banner, and `nextFixture` does not exclude it itself (that is not its job, the
    // game is not "finished") — the caller removes it before calling.
    const fixture = nextFixture(matches.filter((m) => m.status !== 'live'), trainings, new Date())
    console.log('nextFixture(seedé) =', JSON.stringify(fixture && { kind: fixture.kind, id: fixture.id, date: fixture.date }))
    expect(fixture?.kind).toBe('match')
    expect(fixture?.id).toBe(aVenir.id)
    expect(await getConvocation(fixture!.id)).toBeDefined()
  })

  it('the demo holds three plays, one of them on a full court and one with a loose ball', async () => {
    const matches = await listMatches()
    const plays = await listPlays(matches[0].meta.clubId)
    expect(plays).toHaveLength(3)
    expect(plays.filter((s) => s.court === 'full')).toHaveLength(1)
    // A ball on the floor is a Point; carried, it names a marker.
    expect(plays.filter((s) => 'x' in s.steps[0].ball)).toHaveLength(1)
    // Every step keeps its full complement — the defence only appears where the play
    // asks for it.
    for (const s of plays) for (const t of s.steps) expect(t.markers).toHaveLength(s.defense ? 10 : 5)
  })

  it('files the demo plays and attaches some to the next session', async () => {
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    const plays = await listPlays(clubId)
    // Two distinct folders: otherwise the library's bar would have a single tab and
    // would not show what it can do.
    expect(folders(plays)).toEqual(['Attaque placée', 'Remises en jeu'])
    expect(plays.every((s) => !!s.folder)).toBe(true)

    // The pick and roll runs all the way to the basket: the 5 reaches the end of their
    // cut and receives the ball, instead of a finish that existed only as arrows.
    const pnr = plays.find((s) => s.name.includes('Pick and roll'))!
    expect(pnr.steps).toHaveLength(4)
    const fin = pnr.steps[3]
    expect(fin.ball).toEqual({ side: 'offense', position: 5 })
    const cinqAvant = pnr.steps[2].markers.find((p) => p.side === 'offense' && p.position === 5)!
    const cinqApres = fin.markers.find((p) => p.side === 'offense' && p.position === 5)!
    expect(cinqApres.at.y).toBeLessThan(cinqAvant.at.y)
    // Near the basket (y = 0 at the baseline), and not halfway.
    expect(cinqApres.at.y).toBeLessThan(0.25)

    // The next upcoming session carries two plays, both of which exist — an orphan id
    // would make the calendar's count lie.
    const aujourdHui = new Date()
    const jour = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}-${String(aujourdHui.getDate()).padStart(2, '0')}`
    const prochaine = (await listTrainings()).filter((t) => t.date >= jour).sort((a, b) => a.date.localeCompare(b.date))[0]
    expect(prochaine.playIds).toHaveLength(2)
    const existants = new Set(plays.map((s) => s.id))
    expect(prochaine.playIds!.every((id) => existants.has(id))).toBe(true)
  })

  it('clears trainings and call-ups before re-seeding, so as to leave no orphans', async () => {
    await saveTraining({ id: 'orphelin', clubId: 'zzz', date: '2000-01-01' })
    await saveConvocation({ matchId: 'inexistant', playerIds: ['x'] })
    localStorage.removeItem('seed-version') // forces a re-seed on the next call
    await seedDevData()
    expect((await listTrainings()).some((t) => t.id === 'orphelin')).toBe(false)
    expect(await getConvocation('inexistant')).toBeUndefined()
  })
})

describe('the seed\'s version guard', () => {
  it('the fingerprint changes as soon as a datum changes', () => {
    // The real defect was not in the data but in the guard: the version was a number
    // to bump from memory, and we forgot to when fixing the distribution of baskets.
    // Browsers already up to date on the old version therefore regenerated nothing, and
    // the fixed bug stayed visible.
    const base = [[[2, 'CAUTENET', 'Louis']], { 11: 6 }]
    const autreJoueur = [[[2, 'CAUTENET', 'Louise']], { 11: 6 }]
    const autrePoids = [[[2, 'CAUTENET', 'Louis']], { 11: 7 }]
    expect(fingerprint(base)).not.toBe(fingerprint(autreJoueur))
    expect(fingerprint(base)).not.toBe(fingerprint(autrePoids))
    expect(fingerprint(base)).toBe(fingerprint(base))   // et stable à données égales
  })

  it('the fingerprint does not depend on today\'s date', () => {
    // The seed's dates are anchored on today. Including them would regenerate
    // everything each night, erasing what a developer entered the day before.
    expect(DATA_FINGERPRINT).toBe(DATA_FINGERPRINT)
    expect(DATA_FINGERPRINT).not.toMatch(new RegExp(String(new Date().getFullYear())))
  })

  it('a re-seed follows the version, and replays nothing at an equal version', async () => {
    const version = localStorage.getItem('seed-version')
    expect(version).toContain(DATA_FINGERPRINT)
    // At an identical version, a second call does not touch the store: we do not
    // overwrite what a developer has just entered by hand.
    await savePlayer({ id: 'ajout-main', teamId: (await listMatches())[0].meta.clubId, number: 99, lastName: 'TEST', firstName: 'Manuel' })
    await seedDevData()
    expect((await listPlayers((await listMatches())[0].meta.clubId)).some((p) => p.id === 'ajout-main')).toBe(true)
    // Version changed: everything is regenerated, so the manual addition disappears.
    localStorage.setItem('seed-version', 'autre-chose')
    await seedDevData()
    expect((await listPlayers((await listMatches())[0].meta.clubId)).some((p) => p.id === 'ajout-main')).toBe(false)
  })
})
