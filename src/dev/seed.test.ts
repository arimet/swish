import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { seedDevData } from './seed'
import { db } from '../persistence/db'
import { getConvocation, listMatches, listPlayers, listPlays, listResults, listTeams, listTrainings, saveConvocation, saveTraining } from '../persistence/repositories'
import { playingTimes } from '../domain/playingtime'
import { nextFixture } from '../domain/fixtures'
import { dossiers } from '../domain/plays'

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear(); await db.results.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear()
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
      expect(rencontres).toBeGreaterThanOrEqual(2)
    }
  })

  it('ne produit aucune égalité (un match de basket ne se termine jamais à égalité)', async () => {
    const results = await listResults()
    expect(results.every((r) => r.homeScore !== r.awayScore)).toBe(true)
  })

  it('crée des entraînements pour notre club, aux semaines des rencontres', async () => {
    const trainings = await listTrainings()
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    expect(trainings.length).toBeGreaterThan(0)
    // Sans clubId, un entraînement fuiterait dans le calendrier de n'importe quel autre club.
    expect(trainings.every((t) => t.clubId === clubId)).toBe(true)
  })

  it('pose la convocation de démonstration sur la rencontre à venir, jamais sur une rencontre déjà jouée', async () => {
    const matches = await listMatches()
    const aVenir = matches.find((m) => m.status === 'setup')!
    const convocation = await getConvocation(aVenir.id)
    expect(convocation?.playerIds.length).toBeGreaterThan(0)
    for (const jouee of matches.filter((m) => m.status === 'finished')) {
      expect(await getConvocation(jouee.id)).toBeUndefined()
    }
  })

  it('la prochaine échéance juste après un seed est la rencontre convoquée, pas un entraînement', async () => {
    // Les entraînements de la dernière journée sont posés après la rencontre (pas
    // avant, comme les autres journées) : sans quoi, plus proches dans le temps que
    // la rencontre convoquée, ils masqueraient le bloc « convoqués » pendant plusieurs
    // jours après un seed — précisément quand on regarde la démonstration.
    const matches = await listMatches()
    const trainings = await listTrainings()
    const aVenir = matches.find((m) => m.status === 'setup')!
    // Comme le tableau de bord (`Dashboard.tsx`) : la rencontre en direct occupe déjà
    // le bandeau, `nextFixture` ne l'écarte pas lui-même (ce n'est pas son rôle, elle
    // n'est pas « terminée ») — c'est l'appelant qui la retire avant de l'appeler.
    const fixture = nextFixture(matches.filter((m) => m.status !== 'live'), trainings, new Date())
    console.log('nextFixture(seedé) =', JSON.stringify(fixture && { kind: fixture.kind, id: fixture.id, date: fixture.date }))
    expect(fixture?.kind).toBe('match')
    expect(fixture?.id).toBe(aVenir.id)
    expect(await getConvocation(fixture!.id)).toBeDefined()
  })

  it('la démonstration contient trois schémas, dont un sur terrain complet et un ballon posé', async () => {
    const matches = await listMatches()
    const schemas = await listPlays(matches[0].meta.clubId)
    expect(schemas).toHaveLength(3)
    expect(schemas.filter((s) => s.terrain === 'complet')).toHaveLength(1)
    // Un ballon au sol est un Point ; porté, c'est un pion désigné.
    expect(schemas.filter((s) => 'x' in s.temps[0].ballon)).toHaveLength(1)
    // Chaque temps garde son effectif complet — la défense n'apparaît que là où
    // le schéma la demande.
    for (const s of schemas) for (const t of s.temps) expect(t.pions).toHaveLength(s.defense ? 10 : 5)
  })

  it('range les schémas de démonstration et en attache à la prochaine séance', async () => {
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    const schemas = await listPlays(clubId)
    // Deux dossiers distincts : sans quoi la barre de la bibliothèque n'aurait
    // qu'un onglet et ne montrerait pas ce qu'elle sait faire.
    expect(dossiers(schemas)).toEqual(['Attaque placée', 'Remises en jeu'])
    expect(schemas.every((s) => !!s.dossier)).toBe(true)

    // Le pick and roll va jusqu'au panier : le 5 arrive au bout de sa course et
    // reçoit le ballon, au lieu d'une finition qui n'existait qu'en flèches.
    const pnr = schemas.find((s) => s.nom.includes('Pick and roll'))!
    expect(pnr.temps).toHaveLength(4)
    const fin = pnr.temps[3]
    expect(fin.ballon).toEqual({ camp: 'attaque', poste: 5 })
    const cinqAvant = pnr.temps[2].pions.find((p) => p.camp === 'attaque' && p.poste === 5)!
    const cinqApres = fin.pions.find((p) => p.camp === 'attaque' && p.poste === 5)!
    expect(cinqApres.at.y).toBeLessThan(cinqAvant.at.y)
    // Près du panier (y = 0 à la ligne de fond), et non à mi-chemin.
    expect(cinqApres.at.y).toBeLessThan(0.25)

    // La prochaine séance à venir porte deux schémas, tous deux existants — un
    // identifiant orphelin ferait mentir le compte du calendrier.
    const aujourdHui = new Date()
    const jour = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}-${String(aujourdHui.getDate()).padStart(2, '0')}`
    const prochaine = (await listTrainings()).filter((t) => t.date >= jour).sort((a, b) => a.date.localeCompare(b.date))[0]
    expect(prochaine.playIds).toHaveLength(2)
    const existants = new Set(schemas.map((s) => s.id))
    expect(prochaine.playIds!.every((id) => existants.has(id))).toBe(true)
  })

  it('vide entraînements et convocations avant de re-seeder, pour ne pas laisser d’orphelins', async () => {
    await saveTraining({ id: 'orphelin', clubId: 'zzz', date: '2000-01-01' })
    await saveConvocation({ matchId: 'inexistant', playerIds: ['x'] })
    localStorage.removeItem('seed-version') // force le re-seed au prochain appel
    await seedDevData()
    expect((await listTrainings()).some((t) => t.id === 'orphelin')).toBe(false)
    expect(await getConvocation('inexistant')).toBeUndefined()
  })
})
