import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamCreate } from './TeamCreate'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'

beforeEach(async () => { sessionStorage.setItem('admin-unlocked', '1'); await db.teams.clear(); await db.players.clear() })

describe('TeamCreate', () => {
  it('crée une équipe (avec un joueur) et la persiste', async () => {
    render(<MemoryRouter><AdminProvider><TeamCreate /></AdminProvider></MemoryRouter>)

    await userEvent.type(screen.getByLabelText(/nom de l.équipe/i), 'VIGNOT')

    // Ajoute un joueur au passage
    await userEvent.type(screen.getByPlaceholderText('N°'), '7')
    await userEvent.type(screen.getByPlaceholderText('Nom'), 'HOSTIN')
    await userEvent.click(screen.getByRole('button', { name: '+' }))

    await userEvent.click(screen.getByRole('button', { name: /créer l.équipe/i }))

    await waitFor(async () => expect(await db.teams.count()).toBe(1))
    const teams = await db.teams.toArray()
    expect(teams[0].name).toBe('VIGNOT')
    expect(await db.players.count()).toBe(1)
  })
})
