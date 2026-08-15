import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDetail } from './TeamDetail'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { getTeam, listPlayers, saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
})

const renderTeam = () =>
  render(
    <MemoryRouter initialEntries={['/teams/ta']}>
      <ClubProvider>
        <AuthProvider>
          <Routes><Route path="/teams/:id" element={<TeamDetail />} /></Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('TeamDetail — the player details', () => {
  it('fills in the birth date without changing the player\'s id', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    // Libellé du bloc d'édition distinct de celui du formulaire d'ajout (« Date de
    // naissance ») : les deux coexistent à l'écran, ils doivent rester attrapables
    // sans ambiguïté chacun par leur propre nom accessible.
    await userEvent.type(screen.getByLabelText(/^naissance$/i), '2000-06-15')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // L'identifiant doit survivre : il porte tout l'historique de tirs du joueur.
      expect(p.id).toBe('p1')
      expect(p.birthDate).toBe('2000-06-15')
    })
  })

  it('fills in the height', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/taille du joueur/i), '192')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(async () => expect((await listPlayers('ta'))[0].height).toBe(192))
  })

  it('clears a birth date and a height already filled in', async () => {
    await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas', birthDate: '2000-06-15', height: 190 })
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.clear(screen.getByLabelText(/^naissance$/i))
    await userEvent.clear(screen.getByLabelText(/taille du joueur/i))
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // Un champ vidé redevient `undefined`, jamais '' ni 0 ni NaN.
      expect(p.birthDate).toBeUndefined()
      expect(p.height).toBeUndefined()
    })
  })

  it('adds a player with their birth date and height', async () => {
    renderTeam()
    // Le formulaire est replié : il apparaît sur un clic, jamais d'emblée.
    await userEvent.click(await screen.findByRole('button', { name: /ajouter un joueur/i }))
    await userEvent.type(await screen.findByPlaceholderText('N°'), '9')
    await userEvent.type(screen.getByPlaceholderText('Nom'), 'DUPONT')
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '1998-03-02')
    await userEvent.type(screen.getByLabelText(/taille/i), '201')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le joueur/i }))

    await waitFor(async () => {
      const ajoute = (await listPlayers('ta')).find((p) => p.lastName === 'DUPONT')
      expect(ajoute?.birthDate).toBe('1998-03-02')
      expect(ajoute?.height).toBe(201)
    })
  })
})

describe('TeamDetail — rights', () => {
  it('editing the roster is administrative: the scorer\'s table sees none of its buttons, and nothing is written', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderTeam()
    await screen.findByText(/MARTIN/)

    // Elle consulte la fiche entière — bilan, marqueurs, effectif — sans qu'aucune
    // action d'écriture lui soit proposée, donc sans demande de code au clic.
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier MARTIN/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('N°')).not.toBeInTheDocument()
    // Ce qui compte : l'effectif n'a pas bougé.
    expect(await listPlayers('ta')).toHaveLength(1) // MARTIN seul, DUPONT n'a pas été ajouté
  })

  it('removes a player only after confirmation', async () => {
    // Ce chemin n'était pas couvert, et c'est pour ça que le défaut a tenu : « retirer »
    // supprimait le joueur sur un clic unique, depuis un bouton de vingt-quatre pixels
    // collé à « modifier », alors que supprimer l'équipe juste au-dessus demandait
    // confirmation. Aucun test n'a cassé quand j'ai ajouté le dialogue — preuve qu'il
    // n'y avait rien là pour le dire.
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /retirer MARTIN/i }))

    expect(await screen.findByText(/retirer MARTIN Lucas/i)).toBeInTheDocument()
    expect(await listPlayers('ta')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /^retirer$/i }))
    // `guard()` déclenche l'action sans l'attendre : la base se vide après le clic.
    await waitFor(async () => expect(await listPlayers('ta')).toHaveLength(0))
  })

  it('shows the add form only after a click', async () => {
    renderTeam()
    await screen.findByRole('button', { name: /ajouter un joueur/i })
    expect(screen.queryByPlaceholderText('N°')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ajouter un joueur/i }))
    expect(await screen.findByPlaceholderText('N°')).toBeInTheDocument()
  })

  it('does not let anyone type a coach the right will not let them save', async () => {
    // Même exigence que sur le champ de score du championnat : ce que l'écran
    // affiche et ce que contient la base doivent dire la même chose. Le champ ne
    // s'affiche donc pas du tout sans le droit, plutôt que de s'ouvrir à la frappe
    // pour se voir refuser à l'envoi.
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderTeam()
    await screen.findByText(/MARTIN/)

    expect(screen.queryByLabelText(/entraîneur/i)).not.toBeInTheDocument()
    expect((await getTeam('ta'))?.coach).toBeUndefined()
  })
})

describe('TeamDetail — top scorers', () => {
  /** Une rencontre jouée où MARTIN marque : sans points, le panneau reste vide. */
  const matchAvecPoints = async () => {
    await saveMatch({
      id: 'm1',
      meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
      roster: ['p1'],
      status: 'finished',
      events: [
        { id: 'e0', wallClock: 0, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'], period: 1, gameClock: 600 },
        { id: 'e1', wallClock: 1, type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 1, gameClock: 500 },
      ],
    } as Parameters<typeof saveMatch>[0])
  }

  it('every scorer leads to their record', async () => {
    // Le même classement est cliquable au tableau de bord ; il était inerte ici, ce
    // qui obligeait à retrouver le nom dans l'effectif de onze juste au-dessus.
    //
    // La requête est **portée au panneau** et non à la page : l'effectif juste
    // au-dessus contient déjà un lien vers la même fiche, si bien qu'un
    // `getByRole('link')` global passait même quand la ligne du classement n'était
    // pas un lien du tout. Un test qui ne peut pas échouer ne prouve rien.
    await matchAvecPoints()
    renderTeam()
    const titre = await screen.findByRole('heading', { name: 'Meilleurs marqueurs' })
    const panneau = titre.closest('section')!
    // `findByRole` et non `getByRole` : le panneau rend son **titre** dès le premier
    // passage, y compris dans son état vide, alors que ses lignes attendent une
    // lecture asynchrone de la base. Attendre le titre n'attendait donc pas les
    // lignes, et ce test échouait environ une fois sur huit — sur l'état vide, jamais
    // sur un vrai défaut.
    const lien = await within(panneau).findByRole('link', { name: /MARTIN/ })
    expect(lien).toHaveAttribute('href', '/players/p1')
    // Chercher le lien *dans* le panneau suffit à prouver qu'il n'est pas vide : sans
    // point marqué, il rendrait son état vide et la requête échouerait.
  })
})
