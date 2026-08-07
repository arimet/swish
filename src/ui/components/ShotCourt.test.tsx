import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShotChart, ShotPicker } from './ShotCourt'
import type { Shot } from '../../domain/shotchart'

beforeEach(() => {
  // jsdom ne calcule pas de mise en page : on fixe la boîte du SVG à 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

describe('ShotPicker', () => {
  it('convertit un clic en coordonnées normalisées', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(onPick).toHaveBeenCalledTimes(1)
    const spot = onPick.mock.calls[0][0]
    expect(spot.x).toBeCloseTo(0.5, 2)
    expect(spot.y).toBeCloseTo(0.1, 2)
  })

  it('borne un clic débordant dans les limites du terrain', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 400, clientY: -20 })
    expect(onPick.mock.calls[0][0]).toEqual({ x: 1, y: 0 })
  })

  it('offre un bouton par zone pour la saisie au clavier', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).toHaveBeenCalledWith({ x: 0.03, y: 0.12 })
  })
})

describe('ShotChart', () => {
  const shot = (zoneY: number, made: boolean): Shot => ({
    matchId: 'm1', spot: { x: 0.5, y: zoneY }, zone: zoneY > 0.6 ? 'top3' : 'paint', made,
  })

  it('affiche le ratio des zones ayant assez de tentatives', () => {
    render(<ShotChart shots={[shot(0.15, true), shot(0.15, true), shot(0.15, false)]} />)
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('masque le ratio des zones sous le seuil de tentatives', () => {
    render(<ShotChart shots={[shot(0.15, true)]} />)
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })

  it('trace un point par tir', () => {
    const { container } = render(<ShotChart shots={[shot(0.15, true), shot(0.65, false)]} />)
    expect(container.querySelectorAll('[data-shot]')).toHaveLength(2)
  })
})
