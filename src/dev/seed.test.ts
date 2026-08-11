import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { seedDevData } from './seed'
import { db } from '../persistence/db'
import { listMatches, listPlayers, listResults, listTeams } from '../persistence/repositories'
import { playingTimes } from '../domain/playingtime'

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear(); await db.results.clear()
  await seedDevData()
})

describe('données de démonstration', () => {
  it('ne crée que les équipes qui jouent', async () => {
    const teams = await listTeams()
    const matches = await listMatches()
    const utilisees = new Set(matches.flatMap((m) => [m.meta.clubId, m.meta.opponentId]))
    expect(teams.every((t) => utilisees.has(t.id))).toBe(true)
  })

  it('ne crée aucun effectif adverse', async () => {
    const matches = await listMatches()
    const adversaires = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of adversaires) expect(await listPlayers(id)).toHaveLength(0)
  })

  it('produit des rotations, donc un temps de jeu crédible', async () => {
    const joue = (await listMatches()).find((m) => m.status === 'finished')!
    const temps = [...playingTimes(joue).values()].filter((t) => t > 0)
    // Sans SUBSTITUTION, seuls les cinq titulaires auraient du temps de jeu.
    expect(temps.length).toBeGreaterThan(5)
  })

  it('crée des résultats extérieurs pour que le classement ait du sens', async () => {
    const results = await listResults()
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    // Aucun résultat saisi ne doit concerner notre club : nos rencontres font foi.
    expect(results.every((r) => r.homeId !== clubId && r.awayId !== clubId)).toBe(true)
    // Chaque adversaire doit avoir joué contre plusieurs équipes, pas seulement contre nous.
    const adversaires = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of adversaires) {
      const rencontres = results.filter((r) => r.homeId === id || r.awayId === id).length
      expect(rencontres).toBeGreaterThan(0)
    }
  })
})
