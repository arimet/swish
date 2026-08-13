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
  it('affiche le bilan du club', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('met le match en direct en tête', async () => {
    // Le raccourci vers la table de marque est réservé à qui la tient : ce test se
    // place de son côté, le cas du visiteur est vérifié juste en dessous.
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('un visiteur lit le score en direct sans se voir proposer d’ouvrir la table de marque', async () => {
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
    sessionStorage.setItem(ROLE_KEY, 'marque')
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
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(0), clubId: 'ta', opponentId: 'tb' } })
    await saveMatch({ ...finished('m5', 2, 1), id: 'm5', status: 'live', meta: { championshipLabel: 'Poule A', date: dansNJours(1), clubId: 'ta', opponentId: 'tb' } })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
    expect(await screen.findByText(/rien de planifié/i)).toBeInTheDocument()
  })
})

describe('Dashboard — les schémas de la prochaine séance', () => {
  // `queryAll` et non `getAll` : sans droit d'écriture, un tableau de bord sans
  // rencontre à venir n'a plus le moindre lien — « + Planifier » est réservé à
  // qui gère le club — et `getAllByRole` lèverait au lieu de rendre une liste vide.
  const lecteurs = () => screen.queryAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('/lecteur'))

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

// ── Le message d'équipe ─────────────────────────────────────────────────────
// Le seul canal du coach vers son équipe : un texte court, un seul à la fois,
// lu par tout le monde en ouvrant l'application, écrit et effacé par le seul
// administrateur.

describe('Dashboard — le message à l’équipe', () => {
  const ouvrirLaSaisie = async () => userEvent.click(await screen.findByRole('button', { name: /message à l’équipe/i }))

  it('affiche le message écrit, avec son âge', async () => {
    const avantHier = new Date(Date.now() - 2 * 86400_000).toISOString()
    await saveMessage({ clubId: 'ta', texte: 'Pas d’entraînement mardi, gymnase fermé.', écritLe: avantHier })
    renderDash()

    expect(await screen.findByText(/gymnase fermé/)).toBeInTheDocument()
    expect(await screen.findByText(/il y a 2 jours/i)).toBeInTheDocument()
  })

  it('n’occupe pas le tableau de bord quand il n’y a pas de message', async () => {
    renderDash()
    await screen.findByText('VIGNOT')
    expect(screen.queryByTestId('message-equipe')).not.toBeInTheDocument()
  })

  it('n’occupe pas le tableau de bord pour un message vide : un blanc n’est pas un message', async () => {
    await saveMessage({ clubId: 'ta', texte: '   ', écritLe: new Date().toISOString() })
    renderDash()
    await screen.findByText('VIGNOT')
    // On laisse la lecture du message se poser avant de conclure à l'absence :
    // sans cette attente, le test passerait aussi bien sans la garde qu'avec,
    // faute d'avoir laissé le message blanc arriver jusqu'au rendu.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('message-equipe')).not.toBeInTheDocument()
  })

  it('un visiteur le lit sans qu’aucun code lui soit demandé', async () => {
    // C'est un message pour l'équipe, joueurs compris : lire est libre.
    await saveMessage({ clubId: 'ta', texte: 'Maillot blanc samedi.', écritLe: new Date().toISOString() })
    renderDash()

    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })

  it('n’affiche le formulaire qu’après un clic, et l’écrit rend le message visible', async () => {
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
    await waitFor(async () => expect((await getMessage('ta'))?.texte).toBe('Gymnase fermé mardi.'), { timeout: 5000 })
    expect(await screen.findByText('Gymnase fermé mardi.', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('en écrire un second remplace le premier', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', texte: 'Ancien message.', écritLe: new Date(Date.now() - 3 * 86400_000).toISOString() })
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
    await waitFor(async () => expect((await getMessage('ta'))?.texte).toBe('Nouveau message.'))
    await waitFor(() => expect(screen.getByText('Nouveau message.')).toBeInTheDocument())
    expect(screen.queryByText('Ancien message.')).not.toBeInTheDocument()
    // Un seul message à la fois : ce n'est pas un fil, il n'y a rien à empiler.
    expect(await db.messages.count()).toBe(1)
  })

  it('l’effacer fait disparaître l’encart', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    await saveMessage({ clubId: 'ta', texte: 'Maillot blanc samedi.', écritLe: new Date().toISOString() })
    renderDash()

    await userEvent.click(await screen.findByRole('button', { name: /effacer/i }))

    await waitFor(() => expect(screen.queryByTestId('message-equipe')).not.toBeInTheDocument())
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('écrire est administratif : la table de marque ne voit pas le bouton, et rien n’est enregistré', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderDash()
    await screen.findByText('VIGNOT')

    // Le bouton n'existe pas pour elle : plus de demande de code au clic sur une
    // action qu'elle n'a pas le droit de mener.
    expect(screen.queryByRole('button', { name: /message à l’équipe/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/message à l’équipe/i)).not.toBeInTheDocument()
    // Ce qui compte reste vrai : rien n'est écrit en base.
    expect(await getMessage('ta')).toBeUndefined()
  })

  it('effacer est administratif : la table de marque ne voit pas le bouton, et le message reste', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await saveMessage({ clubId: 'ta', texte: 'Maillot blanc samedi.', écritLe: new Date().toISOString() })
    renderDash()

    // Elle lit le message — c'en est un pour toute l'équipe — mais ni « Modifier »
    // ni « Effacer » ne lui sont proposés.
    expect(await screen.findByText('Maillot blanc samedi.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument()
    expect(await getMessage('ta')).toBeDefined()
  })

  it('signale que le message reste sur cet appareil', async () => {
    sessionStorage.setItem(ROLE_KEY, 'admin')
    renderDash()
    await ouvrirLaSaisie()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })
})

describe('Dashboard — atteindre la convocation', () => {
  const rencontreAVenir = async () =>
    saveMatch({ ...finished('m4', 0, 0), id: 'm4', status: 'setup', meta: { championshipLabel: 'Poule A', date: dansNJours(5), clubId: 'ta', opponentId: 'tb' } })

  // Convoquer écrit : le raccourci est celui du coach, ces tests se placent donc
  // de son côté. L'affichage des convoqués, lui, est vérifié sans droit plus bas.
  beforeEach(() => sessionStorage.setItem(ROLE_KEY, 'admin'))

  it('mène à la convocation de la prochaine rencontre depuis le bloc « prochaine échéance »', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    renderDash()

    expect(await screen.findByRole('link', { name: /convocation/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('un visiteur lit les convoqués sans se voir proposer de convoquer', async () => {
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: ['p1'], meetTime: '18:00' })
    sessionStorage.removeItem(ROLE_KEY)
    renderDash()

    // Ce qu'un joueur vient chercher — suis-je convoqué, à quelle heure — reste là.
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    expect(screen.getByText(/rendez-vous 18:00/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /convocation|convoquer/i })).not.toBeInTheDocument()
  })

  it('dit clairement que personne n’est convoqué, et propose de convoquer', async () => {
    // C'est justement le moment où l'on veut agir : « convocation à préparer » ne
    // se distinguait pas assez d'un simple libellé, et ne menait nulle part.
    await rencontreAVenir()
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /convoquer/i })).toHaveAttribute('href', '/match/m4#convocation')
  })

  it('traite une convocation enregistrée sans aucun joueur comme une absence de convoqués', async () => {
    // Une convocation vidée de ses joueurs (ou dont l'effectif a été supprimé) est
    // un enregistrement sans convoqué : l'écran doit le dire, pas afficher « 0 ».
    await rencontreAVenir()
    await saveConvocation({ matchId: 'm4', playerIds: [] })
    renderDash()

    expect(await screen.findByText(/personne n’est convoqué/i)).toBeInTheDocument()
  })
})
