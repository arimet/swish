import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import { AuthProvider, PLAYER_ID_KEY, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { getMessage, saveConvocation, saveMatch, saveMessage, savePlay, savePlayer, saveTeam, saveTraining } from '../../persistence/repositories'
import { newPlay, type Play } from '../../domain/plays'
import type { GameEvent, Match } from '../../domain/types'

const schema = (id: string, name: string): Play => ({ id, ...newPlay('ta', 'half', false), name })

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
  // Le rôle vit dans la session de l'onglet : sans ce nettoyage, un test qui
  // déverrouille l'administration laisserait les suivants déjà déverrouillés.
  sessionStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await db.trainings.clear(); await db.convocations.clear(); await db.plays.clear()
  await db.messages.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Dashboard', () => {
  it('shows the club\'s record', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('puts the live game at the top', async () => {
    // Le raccourci vers la table de marque est réservé à qui la tient : ce test se
    // place de son côté, le cas du visiteur est vérifié juste en dessous.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('a visitor reads the live score without being offered the scorer\'s table', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    // Le bandeau du direct reste entier — l'état, l'adversaire, le score : c'est
    // exactement ce qu'un joueur ou un parent vient regarder.
    expect(await screen.findByText(/en direct/i)).toBeInTheDocument()
    expect(screen.getByText(/contre VERDUN/i)).toBeInTheDocument()
    // Six paniers à deux points contre quatre : le bandeau affiche bien 12 – 8.
    expect(screen.getByText(/12/, { selector: '.nums' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /table de marque/i })).not.toBeInTheDocument()
  })

  it('announces the next game when none is in progress', async () => {
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/prochaine rencontre/i)).toBeInTheDocument()
  })

  it('does not announce in the banner a game planned and never played, when the fixture block already excludes it', async () => {
    // Statut resté à `setup` mais date passée : une rencontre planifiée puis jamais
    // jouée. Le bandeau doit appliquer la même règle que `nextFixture` (qui écarte le
    // passé), sans quoi il annoncerait « Prochaine rencontre » à côté d'un bloc
    // « Rien de planifié pour l'instant » contradictoire.
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup', meta: { championshipLabel: 'Poule A', date: '2020-01-10', clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
    expect(screen.queryByText(/prochaine rencontre/i)).not.toBeInTheDocument()
  })

  it('does not show an empty hot zone with no explanation', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/aucun tir localisé/i)).toBeInTheDocument()
  })

  it('shows the club\'s hot zone as soon as one shot is located', async () => {
    await saveMatch(finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]))
    renderDash()
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('announces no game played for a club that is no game\'s clubId', async () => {
    // 'tb' n'apparaît qu'en `opponentId` de m1 : ce n'est jamais « notre » rencontre.
    await saveMatch(finished('m1', 10, 4))
    localStorage.setItem('swish-club-id', 'tb')
    renderDash()
    expect(await screen.findByText('Aucune rencontre jouée')).toBeInTheDocument()
  })

  it('shows the number called up and the meeting point of the next fixture called up', async () => {
    await saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00', meetPlace: 'Gymnase Colette' })
    renderDash()
    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(await screen.findByText(/18:00/)).toBeInTheDocument()
    expect(await screen.findByText(/gymnase colette/i)).toBeInTheDocument()
    expect(await screen.findByText(/MARTIN Lucas/)).toBeInTheDocument()
  })

  it('invites planning when no fixture is scheduled', async () => {
    // Une rencontre jouée, et c'est la prémisse qui manquait : « aucune échéance
    // prévue » décrit un club **en saison** qui n'a rien devant lui. Un club sans
    // aucune rencontre est un autre état — la mise en route — et c'est le test suivant.
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  /**
   * L'arrivée du fondateur, juste après avoir saisi son effectif.
   *
   * Ce que cet écran affichait : quatre tuiles de statistiques à « — », une frise de
   * forme à « — », deux panneaux annonçant l'absence de marqueur et de tir, et deux
   * invitations à planifier une rencontre — dont aucune ne dit qu'il faut d'abord un
   * adversaire enregistré, si bien que les deux menaient à un écran de cul-de-sac.
   * Six blocs pour dire six fois que rien n'a commencé, et pas un chemin praticable.
   */
  it('a club with no game at all gets the getting-started block, not the empty figures', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()

    expect(await screen.findByText(/pour commencer|votre effectif est prêt/i)).toBeInTheDocument()
    // L'étape courante est l'effectif : un seul joueur au fixture, on n'aligne pas un
    // cinq avec ça. C'est bien l'état des données qui décide, et non un compteur
    // mémorisé — l'adversaire « VERDUN » existe déjà, son étape est donc acquise.
    expect(await screen.findByRole('link', { name: /compléter l.effectif/i })).toBeInTheDocument()
    // Une seule action à la fois : proposer les trois laisserait choisir un ordre qui
    // ne marche pas — planifier une rencontre avant d'avoir un adversaire mène au
    // cul-de-sac de `/match/new`.
    expect(screen.queryByRole('link', { name: /nouvelle rencontre/i })).not.toBeInTheDocument()
    // Et rien des chiffres de saison, ni les deux invitations redondantes.
    expect(screen.queryByText(/rien de planifié/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/points encaissés/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pas encore de points marqués/i)).not.toBeInTheDocument()
  })

  it('does not announce the same game twice when it is already live', async () => {
    // Le match en direct a la date du jour (donc « à venir » pour `nextFixture` s'il
    // n'était pas explicitement exclu) : sans l'exclusion, ce test ne discriminerait
    // rien, `nextFixture` ignorant de toute façon une date passée comme '2026-01-10'.
    // Aucune autre échéance que la rencontre en direct : le bloc doit inviter à
    // planifier plutôt que répéter l'adversaire déjà affiché dans le bandeau.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(0), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })

  it('excludes every live game from the next fixture, not only the first', async () => {
    // Rien n'empêche une seconde rencontre `live` sans que la première soit terminée
    // (démarrée par erreur) : les deux doivent rester exclues des échéances à venir,
    // sans quoi la seconde serait annoncée comme « prochaine échéance » alors qu'elle
    // a déjà commencé.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(0), clubId: 'ta', opponentId: 'tb' } })
    await saveMatch({ ...finished('m5', 2, 1), id: 'm5', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(1), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })
})

describe('Dashboard — the next session\'s plays', () => {
  // `queryAll` et non `getAll` : sans droit d'écriture, un tableau de bord sans
  // rencontre à venir n'a plus le moindre lien — « + Planifier » est réservé à
  // qui gère le club — et `getAllByRole` lèverait au lieu de rendre une liste vide.
  const lecteurs = () => screen.queryAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('/lecteur'))

  it('leads to the viewer of every play scheduled for the next session', async () => {
    // Le chemin le plus court entre « c'est mardi » et « voilà ce qu'on travaille ».
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Corner pour le 4'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes', playIds: ['s1', 's2'] })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toHaveAttribute('href', '/schemas/s1/lecteur')
    expect(screen.getByRole('link', { name: /corner pour le 4/i })).toHaveAttribute('href', '/schemas/s2/lecteur')
  })

  it('ignores a deleted play the session still cites', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes', playIds: ['disparu', 's1'] })
    renderDash()

    expect(await screen.findByRole('link', { name: /pick and roll haut/i })).toBeInTheDocument()
    // Un identifiant orphelin ne doit ni casser l'écran, ni ouvrir un lecteur vide.
    expect(lecteurs()).toHaveLength(1)
  })

  it('announces no play when the session carries none', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await saveTraining({ id: 't1', clubId: 'ta', date: dansNJours(2), theme: 'Systèmes' })
    renderDash()

    expect(await screen.findByText(/prochaine échéance/i)).toBeInTheDocument()
    expect(lecteurs()).toHaveLength(0)
  })
})

describe('the player\'s identity', () => {
  it('highlights the identified player\'s row and offers a shortcut to their record', async () => {
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

  it('ignores an id matching no player in the roster', async () => {
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

// ── Le message d'équipe ─────────────────────────────────────────────────────
// Le seul canal du coach vers son équipe : un texte court, un seul à la fois,
// lu par tout le monde en ouvrant l'application, écrit et effacé par le seul
// administrateur.

describe('Dashboard — the message to the team', () => {
  const ouvrirLaSaisie = async () => userEvent.click(await screen.findByRole('button', { name: /message à l’équipe/i }))

  it('shows the message written, with its age', async () => {
    const avantHier = new Date(Date.now() - 2 * 86400_000).toISOString()
    await saveMessage({ clubId: 'ta', text: 'Pas d’entraînement mardi, gymnase fermé.', writtenAt: avantHier })
    renderDash()

    expect(await screen.findByText(/gymnase fermé/)).toBeInTheDocument()
    expect(await screen.findByText(/il y a 2 jours/i)).toBeInTheDocument()
  })

  it('does not occupy the dashboard when there is no message', async () => {
    renderDash()
    await screen.findByText('VIGNOT')
    expect(screen.queryByTestId('team-message')).not.toBeInTheDocument()
  })

  it('does not occupy the dashboard for an empty message: whitespace is not a message', async () => {
    await saveMessage({ clubId: 'ta', text: '   ', writtenAt: new Date().toISOString() })
    renderDash()
    await screen.findByText('VIGNOT')
    // On laisse la lecture du message se poser avant de conclure à l'absence :
    // sans cette attente, le test passerait aussi bien sans la garde qu'avec,
    // faute d'avoir laissé le message blanc arriver jusqu'au rendu.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('team-message')).not.toBeInTheDocument()
  })

  it('a visitor reads it without being asked for any code', async () => {
    // C'est un message pour l'équipe, joueurs compris : lire est libre.
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })

  it('shows the form only after a click, and writing makes the message visible', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()
    await screen.findByText('VIGNOT')
    expect(screen.queryByLabelText(/message à l’équipe/i)).not.toBeInTheDocument()

    await ouvrirLaSaisie()
    await userEvent.type(await screen.findByLabelText(/message à l’équipe/i), 'Gymnase fermé mardi.')
    await userEvent.click(screen.getByRole('button', { name: /publier/i }))

    // `guard()` déclenche l'action sans l'attendre : après le clic, l'écriture en
    // base puis le re-rendu sont asynchrones. On attend la base d'abord — sous la
    // charge de la suite complète, la seconde par défaut ne lui suffit pas
    // toujours — puis l'écran, qui ne peut que suivre.
    await waitFor(async () => expect((await getMessage('ta'))?.text).toBe('Gymnase fermé mardi.'), { timeout: 5000 })
    expect(await screen.findByText('Gymnase fermé mardi.', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('writing a second replaces the first', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', text: 'Ancien message.', writtenAt: new Date(Date.now() - 3 * 86400_000).toISOString() })
    renderDash()

    // On attend que l'ancien message soit affiché avant d'ouvrir la saisie : le
    // chargement est asynchrone, et ouvrir avant qu'il aboutisse laissait sa
    // résolution écraser le texte fraîchement publié — d'où l'instabilité.
    await screen.findByText('Ancien message.')
    await userEvent.click(await screen.findByRole('button', { name: /modifier/i }))
    const champ = await screen.findByLabelText(/message à l’équipe/i)
    // Un seul événement plutôt que seize frappes : c'est exactement ce que le champ
    // contrôlé écoute, et la frappe caractère par caractère rendait ce test instable
    // sous la charge de la suite complète — il échouait une fois sur trois.
    fireEvent.change(champ, { target: { value: 'Nouveau message.' } })
    // « Publier » reste éteint tant que le texte est vide : cliquer avant que React
    // ait validé la saisie ne faisait rien, et le test échouait sans rien prouver.
    await waitFor(() => expect(champ).toHaveValue('Nouveau message.'))
    await userEvent.click(screen.getByRole('button', { name: /publier/i }))

    // La base d'abord — c'est elle qui fait foi —, puis l'écran. Assertion sur
    // l'écran seul : elle échouait une fois sur sept sous la charge de la suite
    // complète, sans que la cause soit établie. Attendre les deux plutôt que de
    // supposer l'ordre vérifie la même chose sans dépendre du minutage.
    await waitFor(async () => expect((await getMessage('ta'))?.text).toBe('Nouveau message.'))
    await waitFor(() => expect(screen.getByText('Nouveau message.')).toBeInTheDocument())
    expect(screen.queryByText('Ancien message.')).not.toBeInTheDocument()
    // Un seul message à la fois : ce n'est pas un fil, il n'y a rien à empiler.
    expect(await db.messages.count()).toBe(1)
  })

  it('erasing it makes the panel disappear', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    await userEvent.click(await screen.findByRole('button', { name: /effacer/i }))

    await waitFor(() => expect(screen.queryByTestId('team-message')).not.toBeInTheDocument())
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('writing is administrative: the scorer\'s table does not see the button, and nothing is saved', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderDash()
    await screen.findByText('VIGNOT')

    // Le bouton n'existe pas pour elle : plus de demande de code au clic sur une
    // action qu'elle n'a pas le droit de mener.
    expect(screen.queryByRole('button', { name: /message à l’équipe/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/message à l’équipe/i)).not.toBeInTheDocument()
    // Ce qui compte reste vrai : rien n'est écrit en base.
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('erasing is administrative: the scorer\'s table does not see the button, and the message stays', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await saveMessage({ clubId: 'ta', text: 'Maillot blanc samedi.', writtenAt: new Date().toISOString() })
    renderDash()

    // Elle lit le message — c'en est un pour toute l'équipe — mais ni « Modifier »
    // ni « Effacer » ne lui sont proposés.
    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument()
    expect(await getMessage('ta')).toBeDefined()
  })

  it('says that the message stays on this device', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()
    await ouvrirLaSaisie()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })
})

describe('Dashboard — reaching the call-up', () => {
  const rencontreAVenir = async () =>
    saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })

  // Convoquer écrit : le raccourci est celui du coach, ces tests se placent donc
  // de son côté. L'affichage des convoqués, lui, est vérifié sans droit plus bas.
  beforeEach(() => sessionStorage.setItem(ROLE_KEY, 'admin'))

  it('leads to the next game\'s call-up from the "next fixture" block', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    renderDash()

    expect(await screen.findByRole('link', { name: /convocation/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('a visitor reads who is called up without being offered to call anyone up', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    sessionStorage.removeItem(ROLE_KEY)
    renderDash()

    // Ce qu'un joueur vient chercher — suis-je convoqué, à quelle heure — reste là.
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(screen.getByText(/rendez-vous 18:00/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /convocation|convoquer/i })).not.toBeInTheDocument()
  })

  it('says plainly that nobody is called up, and offers to call up', async () => {
    // C'est justement le moment où l'on veut agir : « convocation à préparer » ne
    // se distinguait pas assez d'un simple libellé, et ne menait nulle part.
    await rencontreAVenir()
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /convoquer/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('treats a saved call-up with no player as nobody being called up', async () => {
    // Une convocation vidée de ses joueurs (ou dont l'effectif a été supprimé) est
    // un enregistrement sans convoqué : l'écran doit le dire, pas afficher « 0 ».
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: [] })
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
  })
})
