import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LiveRouter } from './LiveRouter'
import { db } from '../../persistence/db'

describe('LiveRouter', () => {
  it('signale une rencontre introuvable plutôt que de charger indéfiniment', async () => {
    await db.matches.clear()
    render(<MemoryRouter><LiveRouter matchId="inconnu" onFinish={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByText('Rencontre introuvable.')).toBeInTheDocument()
  })
})
