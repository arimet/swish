import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { MatchPreview } from './MatchPreview'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveTeam, savePlayer, saveMatch, getConvocation, saveConvocation } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin') // actions protégées débloquées pour le test
  localStorage.setItem('swish-club-id', 'ta')
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.convocations.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'ANTOINE', firstName: 'Léa' })
  await savePlayer({ id: 'p2', teamId: 'ta', number: 7, lastName: 'BERTRAND', firstName: 'Noa' })
  await savePlayer({ id: 'p3', teamId: 'ta', number: 12, lastName: 'CHARRIER', firstName: 'Zoé' })
  await saveMatch({
    id: 'm1',
    meta: { clubId: 'ta', opponentId: 'tb', date: '2026-09-01' },
    roster: ['p1', 'p2', 'p3'], events: [], status: 'setup',
  })
})

const renderPreview = () =>
  render(<MemoryRouter><ClubProvider><AuthProvider><MatchPreview matchId="m1" /></AuthProvider></ClubProvider></MemoryRouter>)

/** Même écran, mais avec la route de saisie derrière : démarrer la rencontre y
 *  navigue, et c'est l'arrivée sur cet écran qui prouve que le geste est passé. */
const renderAvecSaisie = () =>
  render(
    <MemoryRouter initialEntries={['/match/m1']}>
      <ClubProvider><AuthProvider>
        <Routes>
          <Route path="/match/:id" element={<MatchPreview matchId="m1" />} />
          <Route path="/match/:id/live" element={<p>Écran de saisie</p>} />
        </Routes>
      </AuthProvider></ClubProvider>
    </MemoryRouter>,
  )

describe('MatchPreview — convocation', () => {
  it('cocher deux joueurs puis enregistrer crée une convocation contenant leurs deux identifiants', async () => {
    renderPreview()
    await userEvent.click(await screen.findByLabelText(/ANTOINE/i))
    await userEvent.click(screen.getByLabelText(/BERTRAND/i))
    await userEvent.click(screen.getByRole('button', { name: /enregistrer la convocation/i }))

    await waitFor(async () => {
      const conv = await getConvocation('m1')
      expect(conv?.playerIds).toEqual(expect.arrayContaining(['p1', 'p2']))
      expect(conv?.playerIds).toHaveLength(2)
    })
  })

  it('décocher un joueur déjà convoqué le retire de la convocation enregistrée', async () => {
    await saveConvocation({ matchId: 'm1', playerIds: ['p1', 'p2', 'p3'] })
    renderPreview()
    const caseBertrand = await screen.findByLabelText(/BERTRAND/i)
    await waitFor(() => expect(caseBertrand).toBeChecked())
    await userEvent.click(caseBertrand)
    await userEvent.click(screen.getByRole('button', { name: /enregistrer la convocation/i }))

    await waitFor(async () => {
      const conv = await getConvocation('m1')
      expect(conv?.playerIds).toEqual(expect.arrayContaining(['p1', 'p3']))
      expect(conv?.playerIds).toHaveLength(2)
    })
  })

  it("l'heure et le lieu de rendez-vous sont enregistrés", async () => {
    renderPreview()
    await screen.findByLabelText(/ANTOINE/i)
    await userEvent.type(screen.getByLabelText(/heure de rendez-vous/i), '18:30')
    await userEvent.type(screen.getByLabelText(/lieu de rendez-vous/i), 'Gymnase VIGNOT')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer la convocation/i }))

    await waitFor(async () => {
      const conv = await getConvocation('m1')
      expect(conv?.meetTime).toBe('18:30')
      expect(conv?.meetPlace).toBe('Gymnase VIGNOT')
    })
  })

  it('le nombre de convoqués s\'affiche et suit les cases cochées', async () => {
    renderPreview()
    await screen.findByLabelText(/ANTOINE/i) // attend le chargement de l'effectif avant de lire le compteur
    expect(screen.getByText(/0 convoqué/i)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/ANTOINE/i))
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/BERTRAND/i))
    expect(await screen.findByText(/2 convoqués/i)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/ANTOINE/i))
    expect(await screen.findByText(/1 convoqué/i)).toBeInTheDocument()
  })

  it('précharge une convocation déjà enregistrée', async () => {
    await saveConvocation({ matchId: 'm1', playerIds: ['p3'], meetTime: '17:00', meetPlace: 'Salle B', note: 'Tenue claire' })
    renderPreview()
    const caseCharrier = await screen.findByLabelText(/CHARRIER/i)
    await waitFor(() => expect(caseCharrier).toBeChecked())
    expect(screen.getByLabelText(/ANTOINE/i)).not.toBeChecked()
    expect(screen.getByLabelText(/heure de rendez-vous/i)).toHaveValue('17:00')
    expect(screen.getByLabelText(/lieu de rendez-vous/i)).toHaveValue('Salle B')
    expect(screen.getByLabelText(/consignes/i)).toHaveValue('Tenue claire')
    expect(screen.getByText(/1 convoqué/i)).toBeInTheDocument()
  })

  it('guérit une convocation dont un joueur convoqué a depuis été retiré de l’effectif', async () => {
    // Une convocation enregistrée avant la suppression du joueur peut encore le
    // mentionner (la cascade de `deletePlayer` ne répare que l'avenir) : le compte
    // affiché doit se limiter à l'effectif réel, et décocher le seul joueur restant
    // ne doit jamais réenregistrer le joueur disparu.
    await saveConvocation({ matchId: 'm1', playerIds: ['p2', 'p9-supprimé'] })
    renderPreview()
    const caseBertrand = await screen.findByLabelText(/BERTRAND/i)
    await waitFor(() => expect(caseBertrand).toBeChecked())
    expect(screen.getByText(/1 convoqué/i)).toBeInTheDocument()

    await userEvent.click(caseBertrand)
    await userEvent.click(screen.getByRole('button', { name: /enregistrer la convocation/i }))

    await waitFor(async () => {
      const conv = await getConvocation('m1')
      expect(conv?.playerIds).toEqual([])
    })
  })

  it('porte l’ancre où mènent le tableau de bord et le calendrier', async () => {
    // Les deux écrans où le coach regarde pointent sur `/match/:id#convocation` :
    // sans cette ancre, le lien tomberait en haut de la fiche, exactement le
    // problème qu'il devait résoudre.
    renderPreview()
    await screen.findByLabelText(/ANTOINE/i)
    expect(document.getElementById('convocation')).not.toBeNull()
  })

  it('signale que la convocation reste sur cet appareil', async () => {
    renderPreview()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })

  it("affiche l'effectif du club de la rencontre, pas celui du réglage d'appareil s'ils diffèrent", async () => {
    // Rencontre ancienne rouverte après un changement de club sur cet appareil : le
    // réglage local pointe maintenant vers VERDUN, mais la rencontre appartient à
    // VIGNOT — c'est son effectif qui doit apparaître, jamais celui de VERDUN.
    await savePlayer({ id: 'p9', teamId: 'tb', number: 1, lastName: 'DUPONT', firstName: 'Zoé' })
    localStorage.setItem('swish-club-id', 'tb')
    renderPreview()

    expect(await screen.findByLabelText(/ANTOINE/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/DUPONT/i)).not.toBeInTheDocument()
  })
})

describe('MatchPreview — droits', () => {
  it('la table de marque démarre la rencontre sans qu’aucun code lui soit demandé', async () => {
    // Le bénévole du samedi doit pouvoir lancer le match qu'il va tenir : démarrer
    // relève de la table de marque, pas de l'administration du club.
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderAvecSaisie()
    await userEvent.click(await screen.findByRole('button', { name: /démarrer la rencontre/i }))

    expect(await screen.findByText('Écran de saisie')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Code')).not.toBeInTheDocument()
  })

  it('la convocation reste administrative : la table de marque n’a ni cases ni bouton, et rien n’est enregistré', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderPreview()
    await screen.findByText(/convocation/i)

    // Ni cases à cocher, ni champs de rendez-vous, ni enregistrement : plus rien
    // ne réclame le code administrateur à qui tient seulement la marque.
    expect(screen.queryByRole('button', { name: /enregistrer la convocation/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/ANTOINE/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/heure de rendez-vous/i)).not.toBeInTheDocument()
    // Ce qui compte : rien n'est écrit en base.
    expect(await getConvocation('m1')).toBeUndefined()
  })

  it('la table de marque lit les convoqués sans pouvoir les changer', async () => {
    // Savoir qui est convoqué n'est pas écrire : la liste reste, en toutes lettres.
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await saveConvocation({ matchId: 'm1', playerIds: ['p1'], meetTime: '18:00', meetPlace: 'Gymnase' })
    renderPreview()

    expect(await screen.findByText(/ANTOINE/i)).toBeInTheDocument()
    expect(screen.getByText(/rendez-vous 18:00 · gymnase/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('supprimer la rencontre est administratif : la table de marque ne voit pas le bouton', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderPreview()
    await screen.findByText(/convocation/i)

    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument()
  })

  it('un visiteur ne se voit proposer ni démarrage ni suppression', async () => {
    // Démarrer relève de la table de marque, supprimer de l'administration :
    // le visiteur consulte la fiche, et rien de plus.
    sessionStorage.removeItem(ROLE_KEY)
    renderPreview()
    await screen.findByText(/convocation/i)

    expect(screen.queryByRole('button', { name: /démarrer la rencontre/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument()
    // Le suivi spectateur, lui, reste ouvert à tous.
    expect(screen.getByRole('link', { name: /suivi spectateur/i })).toBeInTheDocument()
  })
})
