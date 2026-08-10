import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShotChart, ShotPicker, ZONE_PATH } from './ShotCourt'
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

describe('ShotPicker — confirmation', () => {
  it('affiche le libellé du tir enregistré dans une zone d’état', () => {
    render(<ShotPicker onPick={vi.fn()} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
  })

  it('neutralise le terrain et les boutons de zone tant que la confirmation est affichée', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette' }} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('fait vibrer l’appareil quand le navigateur le permet', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    render(<ShotPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(vibrate).toHaveBeenCalledWith(15)
    Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('dessine en fond les tirs déjà pris par le joueur', () => {
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
  // Ces chemins ont été vérifiés point par point contre zoneAt par lancer de rayons.
  // Les modifier désalignerait les zones colorées des zones réellement calculées :
  // un tir compté dans la raquette pourrait s'afficher en mi-distance.
  it('reste littéralement inchangé', () => {
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

describe('CourtLines', () => {
  it('donne un identifiant de dégradé distinct à chaque terrain rendu', () => {
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
