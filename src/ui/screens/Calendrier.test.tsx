import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Calendrier } from './Calendrier'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveMatch, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId, opponentId },
  roster: [], events: [], status: 'setup',
})

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  await saveMatch(mk('m1', 'ta', 'tb'))
  await saveMatch(mk('m2', 'tc', 'tb')) // rencontre sans notre club
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Calendrier', () => {
  it('n’affiche que les rencontres du club', async () => {
    render(<MemoryRouter><ClubProvider><Calendrier /></ClubProvider></MemoryRouter>)
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByText(/METZ/)).not.toBeInTheDocument()
  })
})
