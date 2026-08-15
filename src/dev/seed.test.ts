import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { EMPREINTE_DONNEES, empreinte, seedDevData } from './seed'
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
    const steps = [...playingTimes(joue).values()].filter((t) => t > 0)
    // Sans SUBSTITUTION, seuls les cinq titulaires auraient du temps de jeu.
    expect(steps.length).toBeGreaterThan(5)
  })

  it('place l’Avenir de Vignot en tête, à égalité de rencontres jouées', async () => {
    // Le classement FFBB compte des points absolus (V=2, D=1) : être premier exige
    // donc d'avoir joué autant que les autres. Le seed publiait les résultats des
    // cinq journées alors que nous n'en avons que trois de jouées, ce qui rendait la
    // première place arithmétiquement inatteignable — d'où le nombre de rencontres
    // vérifié ici, et pas seulement le rang.
    const [matches, results, teams] = await Promise.all([listMatches(), listResults(), listTeams()])
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
    const lines = standings(matches, results, byId)[0].lines
    expect(lines[0].name).toBe('AVENIR DE VIGNOT')
    expect(lines[0].v).toBe(3)
    expect(lines[0].d).toBe(0)
    expect(new Set(lines.map((l) => l.j))).toEqual(new Set([3]))
    // Et premier sans partage : une égalité de points départagée au différentiel
    // tiendrait au hasard des scores, pas à une intention.
    expect(lines[0].pts).toBeGreaterThan(lines[1].pts)
  })

  it('le cinq majeur est celui que le coach a désigné', async () => {
    const matches = await listMatches()
    const players = await listPlayers(matches[0].meta.clubId)
    const cinq = new Set([2, 11, 13, 15, 17])
    const match = matches.find((m) => m.events.some((e) => e.type === 'STARTING_FIVE'))!
    const ev = match.events.find((e) => e.type === 'STARTING_FIVE') as Extract<typeof match.events[number], { type: 'STARTING_FIVE' }>
    const numeros = ev.playerIds.map((id) => players.find((p) => p.id === id)!.number)
    expect(new Set(numeros)).toEqual(cinq)
  })

  it('répartit les paniers plausiblement : BUZZI devant, une feuille de match crédible', async () => {
    // Trois tentatives ratées avant celle-ci, toutes invisibles sans mesure.
    // La liste pondérée groupée par joueur : `k % longueur` ne sortait jamais du
    // premier bloc, un seul joueur prenait tous les paniers (202 points pour un
    // remplaçant). Entrelacée : on ne dépassait pas les deux premiers tours, donc les
    // poids ne changeaient plus rien. Et le compteur d'allocation remis à zéro à
    // chacun des huit segments d'une rencontre : le plus faible poids n'était jamais
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

    // Le meilleur marqueur est celui que le coach a désigné.
    expect(numero(classe[0][0])).toBe(11)
    // Il domine sans écraser : un quart des points de l'équipe est déjà beaucoup.
    expect(classe[0][1] / total).toBeLessThan(0.25)
    // Et l'écart du premier au dernier marqueur reste celui d'une feuille de match,
    // pas celui d'une aberration : un rapport de dix voulait dire que les poids
    // étaient trop écartés.
    const marqueurs = classe.filter(([, pts]) => pts > 0)
    expect(classe[0][1] / marqueurs[marqueurs.length - 1][1]).toBeLessThan(7)
    // Le banc marque : une allocation qui ne descend pas jusqu'à lui est cassée.
    expect(marqueurs.length).toBeGreaterThanOrEqual(9)
    // Les cinq majeurs restent devant dans l'ensemble — un sixième homme productif
    // peut dépasser le cinquième titulaire, c'est le cas dans une vraie équipe.
    const cinq = new Set([2, 11, 13, 15, 17])
    expect(classe.slice(0, 5).filter(([id]) => cinq.has(numero(id))).length).toBeGreaterThanOrEqual(4)
  })

  /**
   * La feuille de match au complet, et pas seulement sa colonne de points.
   *
   * Trois colonnes étaient vides sur **toutes** les rencontres — 3PT, CT, F — et rien
   * ne le disait. Les positions à trois points existaient dans le seed mais étaient
   * inatteignables (`k % longueur` sur une liste de neuf, avec cinq paniers par
   * segment) ; les contres n'allaient qu'au quatrième joueur du cinq, parce que la
   * statistique était choisie par l'indice du joueur ; et aucune faute n'était jamais
   * saisie, si bien que le compteur d'équipe restait à zéro d'un bout à l'autre.
   *
   * Ce test mesure les cinq catégories. Il n'a pas d'exigence de réalisme fine — les
   * poids sont inventés et se corrigent depuis l'application — mais il refuse le zéro,
   * qui est la seule valeur dont on est sûr qu'elle est fausse.
   */
  it('remplit toute la feuille de match : 3 points, passes, rebonds, contres, fautes', async () => {
    const matches = await listMatches()
    const players = await listPlayers(matches[0].meta.clubId)
    const numero = (id: string) => players.find((p) => p.id === id)!.number
    const joues = matches.filter((m) => m.status === 'finished')
    expect(joues.length).toBeGreaterThan(0)

    for (const m of joues) {
      const stats = playerStats(m)
      const somme = (lire: (s: (typeof stats)[number]) => number) => stats.reduce((t, s) => t + lire(s), 0)

      // Un tir primé se déduit de sa position, jamais déclaré : que la colonne soit
      // non nulle prouve donc aussi que les positions du seed tombent bien derrière
      // la ligne, ce qu'aucune assertion n'avait à répéter à la main.
      expect(somme((s) => s.threes)).toBeGreaterThan(3)
      expect(somme((s) => s.assists)).toBeGreaterThan(10)
      expect(somme((s) => s.defRebounds)).toBeGreaterThan(somme((s) => s.offRebounds))
      expect(somme((s) => s.blocks)).toBeGreaterThan(0)
      expect(somme((s) => s.fouls)).toBeGreaterThan(10)

      // Personne ne sort pour cinq fautes : un joueur exclu quitte le terrain, alors
      // que les rotations du seed le comptent encore présent.
      expect(stats.every((s) => s.fouls < 5)).toBe(true)

      // Les rôles doivent se lire dans les chiffres, sinon les poids par catégorie ne
      // servent à rien : le meilleur passeur est un meneur, le meilleur rebondeur un
      // intérieur. C'est ce qui manquait quand la statistique suivait l'indice du
      // joueur dans le cinq.
      const meilleur = (lire: (s: (typeof stats)[number]) => number) =>
        numero([...stats].sort((a, b) => lire(b) - lire(a))[0].playerId)
      expect([2, 5]).toContain(meilleur((s) => s.assists))
      expect([15, 17, 20, 8]).toContain(meilleur((s) => s.defRebounds))
    }

    // Le total composé retombe **exactement** sur les scores annoncés. Le seed
    // compose maintenant chaque segment avec des tirs de trois valeurs différentes ;
    // une décomposition fausse se lirait comme un bug du tableau d'affichage, pas
    // comme un bug du seed.
    const totaux = joues.map((m) => playerStats(m).reduce((t, s) => t + s.points, 0)).sort((a, b) => a - b)
    expect(totaux).toEqual([72, 78, 81])

    // Une période au moins atteint le bonus (cinq fautes d'équipe en FFBB, et non
    // quatre comme en NBA) : la démonstration doit pouvoir montrer la pastille.
    const parPeriode = new Map<number, number>()
    for (const e of joues[0].events)
      if (e.type === 'FOUL' && e.team === 'A') parPeriode.set(e.period, (parPeriode.get(e.period) ?? 0) + 1)
    expect(Math.max(...parPeriode.values())).toBeGreaterThanOrEqual(TEAM_FOUL_BONUS)
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
    expect(schemas.filter((s) => s.court === 'full')).toHaveLength(1)
    // Un ballon au sol est un Point ; porté, c'est un pion désigné.
    expect(schemas.filter((s) => 'x' in s.steps[0].ball)).toHaveLength(1)
    // Chaque temps garde son effectif complet — la défense n'apparaît que là où
    // le schéma la demande.
    for (const s of schemas) for (const t of s.steps) expect(t.markers).toHaveLength(s.defense ? 10 : 5)
  })

  it('range les schémas de démonstration et en attache à la prochaine séance', async () => {
    const matches = await listMatches()
    const clubId = matches[0].meta.clubId
    const schemas = await listPlays(clubId)
    // Deux dossiers distincts : sans quoi la barre de la bibliothèque n'aurait
    // qu'un onglet et ne montrerait pas ce qu'elle sait faire.
    expect(folders(schemas)).toEqual(['Attaque placée', 'Remises en jeu'])
    expect(schemas.every((s) => !!s.folder)).toBe(true)

    // Le pick and roll va jusqu'au panier : le 5 arrive au bout de sa course et
    // reçoit le ballon, au lieu d'une finition qui n'existait qu'en flèches.
    const pnr = schemas.find((s) => s.name.includes('Pick and roll'))!
    expect(pnr.steps).toHaveLength(4)
    const fin = pnr.steps[3]
    expect(fin.ball).toEqual({ side: 'offense', position: 5 })
    const cinqAvant = pnr.steps[2].markers.find((p) => p.side === 'offense' && p.position === 5)!
    const cinqApres = fin.markers.find((p) => p.side === 'offense' && p.position === 5)!
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

describe('la garde de version du seed', () => {
  it('l’empreinte change dès qu’une donnée change', () => {
    // Le vrai défaut n'était pas dans les données mais dans la garde : la version
    // était un numéro à incrémenter de mémoire, et on a oublié de le faire en
    // corrigeant la répartition des paniers. Les navigateurs déjà à jour sur
    // l'ancienne version n'ont donc rien régénéré, et le bug corrigé restait visible.
    const base = [[[2, 'CAUTENET', 'Louis']], { 11: 6 }]
    const autreJoueur = [[[2, 'CAUTENET', 'Louise']], { 11: 6 }]
    const autrePoids = [[[2, 'CAUTENET', 'Louis']], { 11: 7 }]
    expect(empreinte(base)).not.toBe(empreinte(autreJoueur))
    expect(empreinte(base)).not.toBe(empreinte(autrePoids))
    expect(empreinte(base)).toBe(empreinte(base))   // et stable à données égales
  })

  it('l’empreinte ne dépend pas de la date du jour', () => {
    // Les dates du seed sont ancrées sur aujourd'hui. Les inclure ferait tout
    // régénérer chaque nuit, effaçant ce qu'un développeur a saisi la veille.
    expect(EMPREINTE_DONNEES).toBe(EMPREINTE_DONNEES)
    expect(EMPREINTE_DONNEES).not.toMatch(new RegExp(String(new Date().getFullYear())))
  })

  it('un re-seed suit la version, et ne rejoue rien à version égale', async () => {
    const version = localStorage.getItem('seed-version')
    expect(version).toContain(EMPREINTE_DONNEES)
    // À version identique, un second appel ne touche pas la base : on n'écrase pas
    // ce qu'un développeur vient de saisir à la main.
    await savePlayer({ id: 'ajout-main', teamId: (await listMatches())[0].meta.clubId, number: 99, lastName: 'TEST', firstName: 'Manuel' })
    await seedDevData()
    expect((await listPlayers((await listMatches())[0].meta.clubId)).some((p) => p.id === 'ajout-main')).toBe(true)
    // Version changée : tout est régénéré, donc l'ajout manuel disparaît.
    localStorage.setItem('seed-version', 'autre-chose')
    await seedDevData()
    expect((await listPlayers((await listMatches())[0].meta.clubId)).some((p) => p.id === 'ajout-main')).toBe(false)
  })
})
