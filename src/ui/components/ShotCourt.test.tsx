import { fireEvent, render, screen } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cadre, ShotChart, ShotPicker, ZONE_PATH } from './ShotCourt'
import type { Shot } from '../../domain/shotchart'
import { C } from '../olive/kit'

beforeEach(() => {
  // jsdom computes no layout: we pin the SVG's box to 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

describe('ShotPicker', () => {
  it('converts a click into normalised coordinates', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(onPick).toHaveBeenCalledTimes(1)
    const spot = onPick.mock.calls[0][0]
    expect(spot.x).toBeCloseTo(0.5, 2)
    expect(spot.y).toBeCloseTo(0.1, 2)
  })

  it('clamps an overflowing click to the court\'s bounds', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 400, clientY: -20 })
    expect(onPick.mock.calls[0][0]).toEqual({ x: 1, y: 0 })
  })

  it('offers one button per zone for keyboard entry', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).toHaveBeenCalledWith({ x: 0.03, y: 0.12 })
  })
})

describe('ShotPicker — confirmation', () => {
  it('reserves the pill\'s room even without a confirmation, so as not to shift the buttons', () => {
    render(<ShotPicker onPick={vi.fn()} />)
    // `visibility: hidden` removes the element from the accessibility tree — RTL
    // therefore excludes it from getByRole by default, hence `hidden: true` here. That
    // same removal guarantees a screen reader announces nothing when empty: no need for
    // an extra aria-hidden.
    const status = screen.getByRole('status', { hidden: true })
    expect(status).toBeInTheDocument()
    // An empty string creates no line box: the fallback content must stay a character
    // — the non-breaking space U+00A0 — not ''.
    expect(status.textContent).toBe(' ')
  })

  it('shows the recorded shot\'s label in a status region', () => {
    render(<ShotPicker onPick={vi.fn()} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette', made: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
  })

  it('neutralises the court and the zone buttons while the confirmation shows', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette', made: true }} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('buzzes the device where the browser allows it', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    render(<ShotPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(vibrate).toHaveBeenCalledWith(15)
    Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('does not fill the confirmation circle with the attack colour on a missed shot', () => {
    const { container } = render(
      <ShotPicker onPick={vi.fn()} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: 'MANQUÉ · Raquette', made: false }} />,
    )
    const missed = container.querySelector('[data-confirmation="missed"]')
    expect(missed).toBeInTheDocument()
    expect(missed).not.toHaveAttribute('fill', C.accent)
  })

  it('draws the player\'s earlier shots in the background', () => {
    const shots: Shot[] = [
      { matchId: 'm1', spot: { x: 0.5, y: 0.15 }, zone: 'paint', made: true },
      { matchId: 'm1', spot: { x: 0.5, y: 0.65 }, zone: 'top3', made: false },
    ]
    const { container } = render(<ShotPicker onPick={vi.fn()} shots={shots} />)
    expect(container.querySelectorAll('[data-past-shot]')).toHaveLength(2)
    expect(container.querySelector('[data-past-shot="missed"]')).toBeInTheDocument()
  })
})

describe('ZONE_PATH', () => {
  // These paths were checked point by point against zoneAt by ray casting. Changing
  // them would misalign the coloured zones from the ones actually computed: a shot
  // counted in the key could be shown as mid-range.
  it('stays literally unchanged', () => {
    expect(ZONE_PATH).toEqual({
      paint: 'M 505 0 H 995 V 580 H 505 Z',
      mid_left: 'M 90 0 H 505 V 786.5 A 675 675 0 0 1 90 299.01 Z',
      mid_center: 'M 505 580 H 995 V 786.5 A 675 675 0 0 1 505 786.5 Z',
      mid_right: 'M 1410 0 H 995 V 786.5 A 675 675 0 0 0 1410 299.01 Z',
      corner3_left: 'M 0 0 H 90 V 299.01 H 0 Z',
      corner3_right: 'M 1410 0 H 1500 V 299.01 H 1410 Z',
      top3: 'M 0 299.01 H 90 A 675 675 0 0 0 1410 299.01 H 1500 V 1400 H 0 Z',
    })
  })
})

describe('clipping the zones to the court\'s frame', () => {
  // `corner3_left` starts at (0,0), the frame is inset by 4 and rounded by RAYON:
  // without a clip, the fill spilled into the rounded corners. Both uses — the
  // confirmation after a shot and the zone chart — must carry it.
  const slicedZones = (c: HTMLElement) =>
    [...c.querySelectorAll('g[clip-path] path[d]')].map((p) => p.getAttribute('d'))

  it('clips the confirmation fill', () => {
    const { container } = render(
      <ShotPicker onPick={vi.fn()} confirmation={{ spot: { x: 0.03, y: 0.12 }, label: '3 PTS · Corner gauche', made: true }} />,
    )
    expect(slicedZones(container)).toContain(ZONE_PATH.corner3_left)
  })

  it('clips the shot chart\'s seven zones', () => {
    const { container } = render(<ShotChart shots={[]} />)
    const sliced = slicedZones(container)
    expect(sliced).toHaveLength(7)
    expect(sliced).toContain(ZONE_PATH.corner3_left)
  })

  it('gives the clip the drawn frame, not values copied out', () => {
    const { container } = render(<ShotChart shots={[]} />)
    const sliced = container.querySelector('clipPath rect')!
    for (const [attr, value] of Object.entries(cadre()))
      expect(sliced.getAttribute(attr)).toBe(String(value))
  })
})

describe('CourtLines', () => {
  it('gives each rendered court its own gradient id', () => {
    const { container } = render(<><ShotChart shots={[]} /><ShotChart shots={[]} /></>)
    const ids = [...container.querySelectorAll('radialGradient')].map((g) => g.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('ShotChart', () => {
  const shot = (zoneY: number, made: boolean): Shot => ({
    matchId: 'm1', spot: { x: 0.5, y: zoneY }, zone: zoneY > 0.6 ? 'top3' : 'paint', made,
  })

  it('shows the ratio for zones with enough attempts', () => {
    render(<ShotChart shots={[shot(0.15, true), shot(0.15, true), shot(0.15, false)]} />)
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('hides the ratio for zones under the attempts threshold', () => {
    render(<ShotChart shots={[shot(0.15, true)]} />)
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })

  it('draws one dot per shot', () => {
    const { container } = render(<ShotChart shots={[shot(0.15, true), shot(0.65, false)]} />)
    expect(container.querySelectorAll('[data-shot]')).toHaveLength(2)
  })
})
