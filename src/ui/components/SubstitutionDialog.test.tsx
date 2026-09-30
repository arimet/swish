import { fireEvent, render, screen } from '../../test/render'
import { describe, expect, it, vi } from 'vitest'
import { SubstitutionDialog } from './SubstitutionDialog'
import type { Player } from '../../domain/types'

const p = (n: number): Player => ({ id: `p${n}`, teamId: 't', number: n, lastName: `NOM${n}`, firstName: '' })
const court = [1, 2, 3, 4, 5].map(p)
const bench = [6, 7, 8].map(p)

const open = () => {
  const onSubmit = vi.fn()
  render(<SubstitutionDialog open onClose={vi.fn()} onCourtPlayers={court} benchPlayers={bench} onSubmit={onSubmit} />)
  const pick = (...names: string[]) => { for (const n of names) fireEvent.click(screen.getByRole('button', { name: n })) }
  return { onSubmit, pick, validate: () => screen.getByRole('button', { name: 'Valider les changements' }) }
}

describe('SubstitutionDialog', () => {
  it('changes three for three in one validation, one pair per substitution', () => {
    const { onSubmit, pick, validate } = open()
    pick('1 NOM1', '2 NOM2', '3 NOM3', '6 NOM6', '7 NOM7', '8 NOM8')
    fireEvent.click(validate())
    expect(onSubmit).toHaveBeenCalledWith([['p1', 'p6'], ['p2', 'p7'], ['p3', 'p8']])
  })

  it('keeps Validate greyed while the two sides do not balance', () => {
    const { pick, validate } = open()
    expect(validate()).toBeDisabled()
    pick('1 NOM1', '2 NOM2', '6 NOM6', '7 NOM7', '8 NOM8')
    expect(validate()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('2 sortant(s), 3 entrant(s)')
    // A second tap takes a player back out of the selection.
    pick('8 NOM8')
    expect(validate()).toBeEnabled()
  })
})
