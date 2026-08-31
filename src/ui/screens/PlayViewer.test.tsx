import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayViewer } from './PlayViewer'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { savePlay } from '../../persistence/repositories'
import { newPlay, nextStep, type Play } from '../../domain/plays'
import { clear } from '../../test/fakeApi'

/** Two steps: the point guard goes down from 0.62 to 0.20; nobody else moves. Their
 *  cut is drawn straight, so that the path stays the chord. */
const twoSteps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', false), name: 'Corner pour le 4' }
  const t0 = {
    ...s.steps[0],
    arrows: [{ from: { side: 'offense' as const, position: 1 as const }, stroke: 'cut' as const, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }] }],
  }
  const t1 = nextStep(t0)
  t1.markers = t1.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  return { ...s, steps: [t0, t1] }
}

/** The point guard's two y-coordinates in viewBox units (depth 1400). */
const START = 0.62 * 1400
const FINISH = 0.2 * 1400
const MIDDLE = (START + FINISH) / 2

/** What the system answers to `prefers-reduced-motion`, set test by test. */
let reducedMotion = false

beforeEach(async () => {
  reducedMotion = false
  // jsdom has no `matchMedia`: without this stub, the viewer cannot ask the system
  // whether to drop the interpolation.
  window.matchMedia = ((media: string) => ({
    media, matches: reducedMotion, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
  sessionStorage.removeItem(ROLE_KEY)
  await savePlay(twoSteps())
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/**
 * Renders the viewer, waits for the play to load, then switches to fake timers: in
 * jsdom nothing advances on its own, and an animation loop nobody drives would give
 * tests that pass without proving anything.
 */
async function open() {
  render(
    <MemoryRouter initialEntries={['/schemas/s1/lecteur']}>
      <AuthProvider>
        <Routes>
          <Route path="/schemas/:id/lecteur" element={<PlayViewer />} />
          <Route path="/schemas/:id" element={<p>consultation</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('img', { name: /tableau tactique/ })
  vi.useFakeTimers()
}

const avancer = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const bouton = (name: string | RegExp) => screen.getByRole('button', { name: name })

/**
 * The point guard's y-coordinate as the board draws it: the only proof that playback
 * really moves something, rather than a counter on screen.
 */
function pointGuardY(): number {
  const groupe = [...document.querySelectorAll('g[data-marker="offense"]')]
    .find((n) => n.querySelector('text')?.textContent === '1')
  return Number(groupe!.querySelector('circle')!.getAttribute('cy'))
}

describe('SchemaPlayer — the time-out viewer', () => {
  it('a visitor opens the viewer and steps through without being asked for any code', async () => {
    await open()
    // No role in the session: reading is never gated, a player opens
    // la combinaison chez lui.
    expect(screen.getByRole('img', { name: 'tableau tactique — Corner pour le 4' })).toBeInTheDocument()
    fireEvent.click(bouton('Temps suivant'))
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
    // A full screen with no visible way out is a trap.
    expect(screen.getByRole('link', { name: /Quitter/ })).toHaveAttribute('href', '/schemas/s1')
  })

  it('the two touch halves step forward and back, clamped at the ends', async () => {
    await open()
    const precedent = bouton('Temps précédent')
    const suivant = bouton('Temps suivant')

    // On the first step, going back does nothing: the half is dark and the board does
    // not move. Wrapping here would suggest there are steps behind.
    expect(precedent).toBeDisabled()
    fireEvent.click(precedent)
    expect(pointGuardY()).toBeCloseTo(START, 6)

    fireEvent.click(suivant)
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)
    expect(screen.getByText('Temps 2 / 2')).toBeInTheDocument()

    // On the last step, going forward does nothing either.
    expect(suivant).toBeDisabled()
    fireEvent.click(suivant)
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)

    fireEvent.click(precedent)
    expect(pointGuardY()).toBeCloseTo(START, 6)
  })

  it('from a pause mid-transition, the next half does not stride over a step', async () => {
    // Three steps: the point guard descends in stages. Paused at 70% of the first
    // movement, "next" must land on step 2 — rounding to the nearest would jump to
    // step 3, and the coach would never see the stage they had stopped on to
    // comment.
    const s = twoSteps()
    const t2 = nextStep(s.steps[1])
    t2.markers = t2.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.05 } } : p))
    clear('play')
    await savePlay({ ...s, steps: [...s.steps, t2] })

    await open()
    fireEvent.click(bouton('Lecture'))
    avancer(1050)                                   // 70% of the first transition
    fireEvent.click(bouton('Pause'))
    fireEvent.click(bouton('Temps suivant'))

    expect(pointGuardY()).toBeCloseTo(FINISH, 6)   // step 2, not step 3
  })

  it('"Play" runs the play, "Pause" leaves it where it is', async () => {
    await open()
    fireEvent.click(bouton('Lecture'))
    // A transition lasts 1.5 s: halfway through, the point guard is halfway along.
    avancer(750)
    expect(pointGuardY()).toBeCloseTo(MIDDLE, 0)

    fireEvent.click(bouton('Pause'))
    const arret = pointGuardY()
    avancer(3000)
    expect(pointGuardY()).toBe(arret)
    expect(bouton('Lecture')).toBeInTheDocument()
  })

  it('playback stops at the last step, and the loop restarts from the first', async () => {
    await open()
    fireEvent.click(bouton('Lecture'))
    avancer(2000)
    // Without looping: we stop dead on the last step.
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)
    expect(bouton('Lecture')).toBeInTheDocument()

    // With looping, the last step held, we restart from the first and it goes on.
    fireEvent.click(bouton('Boucle'))
    fireEvent.click(bouton('Lecture'))
    avancer(1600)
    expect(pointGuardY()).toBeCloseTo(START, 6)
    expect(bouton('Pause')).toBeInTheDocument()
  })

  it('slow motion doubles a transition\'s duration', async () => {
    await open()
    fireEvent.click(bouton('Ralenti'))
    fireEvent.click(bouton('Lecture'))
    // 1.5 s in slow motion is half the way: at full speed we would have arrived.
    avancer(1500)
    expect(pointGuardY()).toBeCloseTo(MIDDLE, 0)
    avancer(1500)
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)
  })

  it('under prefers-reduced-motion, playback jumps from one step to the next', async () => {
    reducedMotion = true
    await open()
    fireEvent.click(bouton('Lecture'))
    // No interpolation at all: halfway through we are still exactly on the first step,
    // then we switch to the second in one go.
    avancer(750)
    expect(pointGuardY()).toBeCloseTo(START, 6)
    avancer(750)
    expect(pointGuardY()).toBeCloseTo(FINISH, 6)
  })

  it('the notebook\'s strokes fade during playback and come back at a stop', async () => {
    await open()
    const traits = () => document.querySelectorAll('g[data-stroke]').length
    // Stopped on a step, we re-read the coach's drawing.
    expect(traits()).toBe(1)
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    // In motion, the strokes would saturate the picture — that is what the animation
    // replaces.
    expect(traits()).toBe(0)
    fireEvent.click(bouton('Pause'))
    fireEvent.click(bouton('Temps suivant'))
    fireEvent.click(bouton('Temps précédent'))
    expect(traits()).toBe(1)
  })

  it('playback pauses when the tab goes into the background', async () => {
    await open()
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    const arret = pointGuardY()

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    avancer(3000)
    // On a phone, an animation running in the background drains the battery and ends up
    // somewhere unexpected on return.
    expect(pointGuardY()).toBe(arret)
    expect(bouton('Lecture')).toBeInTheDocument()
  })
})

/**
 * The paths toggle. What the coach asks for during a time-out is to see *where each
 * player is going* while the play runs — not only where they are. The tests aim at the
 * SVG and not at internal state: a counter that changes without the court changing
 * would prove nothing.
 */
describe('SchemaPlayer — showing the movement paths', () => {
  /** The paths drawn on the court, by their stroke. */
  const trajets = () => [...document.querySelectorAll('g[data-stroke]')].map((n) => n.getAttribute('data-stroke'))

  it('the toggle exists and starts off', async () => {
    await open()
    expect(bouton('Trajets')).toHaveAttribute('aria-pressed', 'false')
  })

  it('without it, playback shows no path', async () => {
    // The previous behaviour, preserved: during the animation, the players alone.
    await open()
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toEqual([])
  })

  it('with it, playback shows the point guard\'s path', async () => {
    await open()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toContain('cut')
  })

  it('the path stays shown for as long as the transition lasts', async () => {
    // A path that flickers along the way would be worse than no path.
    await open()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    for (const t of [100, 400, 700, 1000, 1300]) {
      avancer(t === 100 ? 100 : 300)
      expect(trajets(), `à ${t} ms`).toContain('cut')
    }
  })

  it('and the point guard really does travel along that path', async () => {
    // The line and the moving marker come out of the same computation; this test
    // checks that from the outside.
    await open()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toContain('cut')
    expect(pointGuardY()).toBeLessThan(START)
    expect(pointGuardY()).toBeGreaterThan(FINISH)
  })

  it('turning the toggle off mid-playback removes the paths', async () => {
    await open()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(400)
    expect(trajets()).toContain('cut')
    fireEvent.click(bouton('Trajets'))
    expect(trajets()).toEqual([])
  })

  it('stopped on a step, the notebook stays the notebook', async () => {
    // Stopped on a whole step, we re-read the drawn arrows — the toggle changes nothing
    // there, it only speaks about what is being played.
    await open()
    expect(trajets()).toContain('cut')
    fireEvent.click(bouton('Trajets'))
    expect(trajets()).toContain('cut')
  })
})
