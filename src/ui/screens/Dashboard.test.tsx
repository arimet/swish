import 'fake-indexeddb/auto'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import { AuthProvider, PLAYER_ID_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveConvocation, saveMatch, savePlay, savePlayer, saveTeam, saveTraining } from '../../persistence/repositories'
import { nouveauSchema, type Schema } from '../../domain/plays'
import type { GameEvent, Match } from '../../domain/types'

const schema = (id: string, nom: string): Schema => ({ id, ...nouveauSchema('ta', 'demi', false), nom })

const TOP3 = { x: 0.5, y: 0.65 }

// Les dates codées en dur ('2026-01-10' etc.) servent aux tests qui ne regardent
// jamais « aujourd'hui » (bilan, hot zone) : `nextFixture` compare bien à la date
// réelle du moment où le test tourne, donc les échéances qu'on veut voir retenues
// doivent être calculées par rapport à elle, pas à une date fixe qui finirait par
// être dans le passé.
const dansNJours = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

const finished = (id: string, pa: number, pb: number, events: Partial<GameEvent>[] = []): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster: ['p1'], status: 'finished',
  events: [
    { type: 'CLOCK_START' as const },
    ...Array.from({ length: pa }, () => ({ type: 'SCORE' as const, team: 'A' as const, playerId: 'p1', kind: '2int' as const })),
    ...Array.from({ length: pb }, () => ({ type: 'SCORE' as const, team: 'B' as const, kind: '2int' as const })),
    ...events,
  ].map(ev),
})

const renderDash = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><Dashboard /></AuthProvider></ClubProvider></MemoryRouter>)

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Dashboard', () => {
  it('affiche le bilan du club', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('met le match en direct en tête', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('annonce la prochaine rencontre quand aucun match n’est en cours', async () => {
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/prochaine rencontre/i)).toBeInTheDocument()
  })

  it('n’annonce pas au bandeau une rencontre planifiée puis jamais jouée, alors que le bloc échéance l’écarte déjà', async () => {
    // Statut resté à `setup` mais date passée : une rencontre planifiée puis jamais
    // jouée. Le bandeau doit appliquer la même règle que `nextFixture` (qui écarte le
    // passé), sans quoi il annoncerait « Prochaine rencontre » à côté d'un bloc
    // « Rien de planifié pour l'instant » contradictoire.
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: '2020-01-10', clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
    expect(screen.queryByText(/prochaine rencontre/i)).not.toBeInTheDocument()
  })

  it('n’affiche pas de hot zone vide sans explication', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/aucun tir localisé/i)).toBeInTheDocument()
  })

  it('affiche la hot zone du club dès qu’un tir est localisé', async () => {
    await saveMatch(finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]))
    renderDash()
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('n’annonce aucune rencontre jouée pour un club qui n’est le clubId d’aucun match', async () => {
    // 'tb' n'apparaît qu'en `opponentId` de m1 : ce n'est jamais « notre » rencontre.
    await saveMatch(finished('m1', 10, 4))
    localStorage.setItem('swish-club-id', 'tb')
    renderDash()
    expect(await screen.findByText('Aucune rencontre jouée')).toBeInTheDocument()
  })

  it('affiche le nombre de convoqués et le rendez-vous de la prochaine échéance convoquée', async () => {
    await saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00', meetPlace: 'Gymnase Colette' })
    renderDash()
    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(await screen.findByText(/18:00/)).toBeInTheDocument()
    expect(await screen.findByText(/gymnase colette/i)).toBeInTheDocument()
    expect(await screen.findByText(/MARTIN Lucas/)).toBeInTheDocument()
  })

  it('invite à planifier quand aucune échéance n’est prévue', async () => {
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  it('n’annonce pas deux fois la même rencontre quand elle est déjà en direct', async () => {
    // Le match en direct a la date du jour (donc « à venir » pour `nextFixture` s'il
    // n'était pas explicitement exclu) : sans l'exclusion, ce test ne discriminerait
    // rien, `nextFixture` ignorant de toute façon une date passée comme '2026-01-10'.
    // Aucune autre échéance que la rencontre en direct : le bloc doit inviter à
    // planifier plutôt que répéter l'adversaire déjà affiché dans le bandeau.
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(0), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  it('écarte toutes les rencontres en direct de la prochaine échéance, pas seulement la première', async () => {
    // Rien n'empêche une seconde rencontre `live` sans que la première soit terminée
    // (démarrée par erreur) : les deux doivent rester exclues des échéances à venir,
    // sans quoi la seconde serait annoncée comme « prochaine échéance » alors qu'elle
    // a déjà commencé.
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(0), clubId: 'ta', opponentId: 'tb' } })
    await saveMatch({ ...finished('m5', 2, 1), id: 'm5', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(1), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })
})

describe('Dashboard — les schémas de la prochaine séance', () => {
  const lecteurs = () => screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('/lecteur'))

  it('mène au lecteur de chaque schéma prévu à la prochaine séance', async () => {
    // Le chemin le plus court entre « c'est mardi » et « voilà ce qu'on travaille ».
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Corner pour le 4'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes', playIds: ['s1', 's2'] })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toHaveAttribute('href', '/schemas/s1/lecteur')
    expect(screen.getByRole('link', { name: /corner pour le 4/i })).toHaveAttribute('href', '/schemas/s2/lecteur')
  })

  it('ignore un schéma supprimé que la séance cite encore', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes', playIds: ['disparu', 's1'] })
    renderDash()

    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toBeInTheDocument()
    // Un identifiant orphelin ne doit ni casser l'écran, ni ouvrir un lecteur vide.
    expect(lecteurs()).toHaveLength(1)
  })

  it('n’annonce aucun schéma quand la séance n’en porte pas', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes' })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(lecteurs()).toHaveLength(0)
  })
})

describe('identité du joueur', () => {
  it('met en évidence la ligne du joueur identifié et propose un raccourci vers sa fiche', async () => {
    localStorage.setItem(PLAYER_ID_KEY, 'p1')
    await savePlayer({ id: 'p2', teamId: 'ta', number: 9, lastName: 'DURAND', firstName: 'Théo' })
    await saveMatch({ ...finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p2', kind: '2int' }]), roster: ['p1', 'p2'] })
    renderDash()

    const marqueurs = (await screen.findByText('Meilleurs marqueurs')).closest('section')!
    const ligne = within(marqueurs).getByText('MARTIN Lucas').closest('a')!
    expect(within(ligne).getByText('vous')).toBeInTheDocument()
    // Le coéquipier figure dans la même liste sans hériter de la marque.
    const autre = within(marqueurs).getByText('DURAND Théo').closest('a')!
    expect(within(autre).queryByText('vous')).not.toBeInTheDocument()

    expect(await screen.findByRole('link', { name: /ma fiche/i })).toBeInTheDocument()
  })

  it('ignore un identifiant qui ne correspond à aucun joueur de l’effectif', async () => {
    // Joueur retiré de l'effectif, identifiant survivant dans le localStorage :
    // ni mise en évidence fantôme, ni raccourci vers une fiche inexistante.
    localStorage.setItem(PLAYER_ID_KEY, 'parti')
    await saveMatch(finished('m1', 10, 4))
    renderDash()

    const marqueurs = (await screen.findByText('Meilleurs marqueurs')).closest('section')!
    expect(within(marqueurs).getByText('MARTIN Lucas')).toBeInTheDocument()
    expect(within(marqueurs).queryByText('vous')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ma fiche/i })).not.toBeInTheDocument()
  })
})
