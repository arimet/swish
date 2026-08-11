import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { MatchPreview } from './MatchPreview'
import { AdminProvider } from '../../app/admin'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveTeam, savePlayer, saveMatch, getConvocation, saveConvocation } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1') // actions protégées débloquées pour le test
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
  render(<MemoryRouter><ClubProvider><AdminProvider><MatchPreview matchId="m1" /></AdminProvider></ClubProvider></MemoryRouter>)

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

  it('signale que la convocation reste sur cet appareil', async () => {
    renderPreview()
    expect(await screen.findByText(/sur cet appareil/i)).toBeInTheDocument()
  })
})
