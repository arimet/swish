import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameClock } from './GameClock'

describe('GameClock', () => {
  it('formate les secondes en mm:ss', () => {
    render(<GameClock running={false} seconds={545} onToggle={() => {}} />)
    expect(screen.getByText('09:05')).toBeInTheDocument()
  })
})
