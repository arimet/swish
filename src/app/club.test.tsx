import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ClubProvider, useClub } from './club'
import { db } from '../persistence/db'
import { saveTeam } from '../persistence/repositories'

function Probe() {
  const { clubId, club, ready } = useClub()
  if (!ready) return <p>chargement</p>
  return <p>club: {clubId ?? 'aucun'} / {club?.name ?? '—'}</p>
}

const renderProbe = () => render(<ClubProvider><Probe /></ClubProvider>)

beforeEach(async () => {
  localStorage.clear()
  await db.teams.clear()
  await saveTeam({ id: 't1', name: 'VIGNOT' })
  await saveTeam({ id: 't2', name: 'VERDUN' })
})

describe('useClub', () => {
  it('starts with no club chosen', async () => {
    renderProbe()
    expect(await screen.findByText(/club: aucun/)).toBeInTheDocument()
  })

  it('reads the saved club back on start', async () => {
    localStorage.setItem('swish-club-id', 't1')
    renderProbe()
    expect(await screen.findByText(/club: t1 \/ VIGNOT/)).toBeInTheDocument()
  })

  it('forgets a club whose team no longer exists', async () => {
    localStorage.setItem('swish-club-id', 'supprimee')
    renderProbe()
    // Sans ce garde, l'application resterait bloquée sur un tableau de bord vide.
    expect(await screen.findByText(/club: aucun/)).toBeInTheDocument()
  })
})

describe('Welcome', () => {
  it('saves the chosen club', async () => {
    const { Welcome } = await import('../ui/screens/Welcome')
    render(<ClubProvider><Welcome /></ClubProvider>)
    await userEvent.click(await screen.findByRole('button', { name: /VIGNOT/ }))
    expect(localStorage.getItem('swish-club-id')).toBe('t1')
  })
})
