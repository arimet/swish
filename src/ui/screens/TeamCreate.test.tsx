import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamCreate } from './TeamCreate'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveTeam } from '../../persistence/repositories'

beforeEach(async () => { sessionStorage.setItem(ROLE_KEY, 'admin'); await db.teams.clear(); await db.players.clear() })

describe('TeamCreate', () => {
  it('creates a team (with a player) and saves it', async () => {
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'VIGNOT')

    // Ajoute un joueur au passage. Les champs se désignent par leur étiquette et
    // non par leur `placeholder` : c'est ce qu'un lecteur d'écran entend, et le
    // `placeholder` ne portait plus le nom du champ depuis qu'il a une étiquette.
    await userEvent.type(screen.getByLabelText('N°'), '7')
    await userEvent.type(screen.getByLabelText('Nom'), 'HOSTIN')
    await userEvent.click(screen.getByRole('button', { name: /ajouter ce joueur/i }))

    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    await waitFor(async () => expect(await db.teams.count()).toBe(1))
    const teams = await db.teams.toArray()
    expect(teams[0].name).toBe('VIGNOT')
    expect(await db.players.count()).toBe(1)
  })
})

describe('TeamCreate — rights', () => {
  it('creating a team is administrative: the scorer\'s table is asked for the admin code', async () => {
    // Une équipe existe déjà, et c'est la prémisse qui manquait à ce test : la règle
    // « créer une équipe est administratif » protège des données, donc elle ne
    // s'applique qu'à partir du moment où il y en a. Sur une base vide, la création
    // est la fondation du club et ne demande rien — voir le test juste en dessous.
    await saveTeam({ id: 'deja', name: 'DÉJÀ LÀ' })
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'VIGNOT')
    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(await db.teams.count()).toBe(1) // seule « DÉJÀ LÀ », rien de créé
  })

  /**
   * La fondation du club, sans code et sans droit préalable.
   *
   * C'était le mur du premier lancement, et il était invisible : le bouton « Créer
   * l'équipe » passait par `guard('manage', …)`, si bien que le tout premier bénévole
   * d'une installation vierge recevait une demande de code administrateur que personne
   * ne lui avait donné — pour la seule action qui rend l'application utilisable. Le
   * parcours de premier lancement était bien testé dans `App.test.tsx`, mais en
   * s'accordant `admin` d'avance « pour tester le parcours plutôt que la boîte de mot
   * de passe » : le contournement était écrit noir sur blanc, et le mur avec lui.
   */
  it('the first team is created without a code, and its author becomes an administrator', async () => {
    sessionStorage.removeItem(ROLE_KEY) // visiteur, l'état par défaut
    render(<MemoryRouter><ClubProvider><AuthProvider><TeamCreate /></AuthProvider></ClubProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'PREMIER CLUB')
    await userEvent.click(screen.getByRole('button', { name: /^créer /i }))

    await waitFor(async () => expect(await db.teams.count()).toBe(1))
    expect(screen.queryByRole('heading', { name: /Accès Administrateur requis/ })).not.toBeInTheDocument()
    // Et le fondateur garde le droit pour la suite, sinon il retombe sur un tableau
    // de bord sans un seul bouton de création.
    expect(sessionStorage.getItem(ROLE_KEY)).toBe('admin')
  })
})
