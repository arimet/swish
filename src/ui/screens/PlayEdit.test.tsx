import { fireEvent, render, screen, waitFor, within } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayEdit } from './PlayEdit'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { getPlay, savePlay } from '../../persistence/repositories'
import { newPlay, type Arrow, type Play } from '../../domain/plays'

// jsdom measures nothing: `getBoundingClientRect` returns zeros, and the screen → SVG
// conversion (`toSvg`) would then return null points for every gesture. A court of
// 300 × 280 px placed at the origin makes the tests' coordinates readable: x px / 300
// and y px / 280 give the normalised values directly.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 280, width: 300, height: 280, toJSON: () => ({}) } as DOMRect
  }
})

const halfCourtPlay = (): Play => ({ id: 's1', ...newPlay('c1', 'half', false) })

// A cut from the point guard towards the wing: serves as the starting arrow for the
// cases that erase, undo or add a step without having to draw it first.
const cut: Arrow = { from: { side: 'offense', position: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.3 }], stroke: 'cut' }

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await savePlay(halfCourtPlay())
})

const renderEdit = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/schemas/${id}/edit`]}>
      <AuthProvider>
        <Routes><Route path="/schemas/:id/edit" element={<PlayEdit />} /></Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

// The interactive board carries the `application` role; the step strip's thumbnails
// are `img`s. That is what tells them apart, their accessible name being
// the same.
const board = async () => await screen.findByRole('application')

describe('SchemaEdit — the playbook editor', () => {
  it('groups the tools by family and says which is active', async () => {
    // Eight pills of equal weight did not say that they do three different things. The
    // four strokes are mutually exclusive: they form their own segment, and each keeps
    // its accessible name — it is the word that gives way to the pictogram, not the
    // label.
    renderEdit('s1')
    const tracer = await screen.findByRole('group', { name: 'Tracer' })
    expect(within(tracer).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Course', 'Écran', 'Passe', 'Dribble', 'Pinceau'])
    expect(within(screen.getByRole('group', { name: 'Manipuler' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Déplacer', 'Gomme'])
    expect(within(screen.getByRole('group', { name: 'Poser' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Ballon', 'Poser'])

    // One tool active at a time, and it says so — otherwise you draw without knowing
    // what.
    expect(screen.getByRole('button', { name: 'Déplacer' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Passe' }))
    expect(screen.getByRole('button', { name: 'Passe' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Déplacer' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('draws a cut arrow from a marker and saves it', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await board()
    // from the point guard (0.5, 0.62) → (150, 173.6) px towards the corner (30, 250)
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 220 })
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 250 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
    expect((await getPlay('s1'))!.steps[0].arrows[0].stroke).toBe('cut')
    expect((await getPlay('s1'))!.steps[0].arrows[0].from).toEqual({ side: 'offense', position: 1 })
  })

  it('ignores a stroke that does not start from a marker', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await board()
    // (0.05, 0.9): the court's corner, no marker within grab range
    fireEvent.pointerDown(svg, { clientX: 15, clientY: 252 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 200 })
    fireEvent.pointerUp(svg, { clientX: 150, clientY: 100 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(0))
  })

  it('the eraser removes an arrow; undo restores it', async () => {
    const s = halfCourtPlay()
    s.steps[0].arrows = [cut]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Gomme' }))
    // (0.5, 0.45): in the middle of the cut's stroke
    fireEvent.pointerDown(await board(), { clientX: 150, clientY: 126 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(0))

    await userEvent.click(screen.getByRole('button', { name: 'Annuler la dernière action' }))
    // Undo restores the store, not only the screen.
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
  })

  it('"+" adds a step that inherits the positions, not the arrows', async () => {
    const s = halfCourtPlay()
    s.steps[0].arrows = [cut]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un temps' }))
    await waitFor(async () => expect((await getPlay('s1'))!.steps).toHaveLength(2))
    const apres = (await getPlay('s1'))!
    expect(apres.steps[1].markers).toEqual(apres.steps[0].markers)
    expect(apres.steps[1].ball).toEqual(apres.steps[0].ball)
    expect(apres.steps[1].arrows).toEqual([])
  })

  it('refuses the move to a half court while the back court is occupied', async () => {
    const s: Play = { id: 's1', ...newPlay('c1', 'full', false) }
    s.steps[0].markers[0] = { ...s.steps[0].markers[0], at: { x: 0.5, y: 0.8 } }
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Demi-terrain' }))
    // The refusal names its occupant, and the saved court does not move.
    expect(await screen.findByText(/le poste 1 occupe la moitié arrière/i)).toBeInTheDocument()
    expect((await getPlay('s1'))!.court).toBe('full')
  })

  it('does not undo in the old scale after a court change', async () => {
    // The stacked entries carry the coordinates from before the remapping. Restoring
    // them as they are would put the markers anywhere — at worst in the back court, the
    // very thing the half court refuses.
    renderEdit('s1')
    const svg = await board()
    // A marker moved, so that there is something to undo.
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 240 })
    fireEvent.pointerUp(svg, { clientX: 120, clientY: 240 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].markers[0].at.y).toBeCloseTo(0.857, 2))

    await userEvent.click(screen.getByRole('button', { name: 'Terrain complet' }))
    await waitFor(async () => expect((await getPlay('s1'))!.court).toBe('full'))

    // The stack is cleared: nothing left to undo, hence nothing to restore crooked.
    expect(screen.getByRole('button', { name: 'Annuler la dernière action' })).toBeDisabled()
    expect((await getPlay('s1'))!.steps[0].markers[0].at.y).toBeCloseTo(0.4285, 3)
  })

  it('does not undo a removed defence: the play does not go back to ten markers', async () => {
    // A stacked entry carries ten markers; restoring it after the defence is removed
    // would write `defense: false` with its defenders — the "five or
    // dix pions selon `defense` » cassée, et écrite en base.
    const s: Play = { id: 's2', ...newPlay('c1', 'half', true) }
    await savePlay(s)
    renderEdit('s2')
    const svg = await board()
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 240 })
    fireEvent.pointerUp(svg, { clientX: 120, clientY: 240 })
    await waitFor(async () => expect((await getPlay('s2'))!.steps[0].markers).toHaveLength(10))

    await userEvent.click(screen.getByRole('checkbox', { name: /défense/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(async () => expect((await getPlay('s2'))!.steps[0].markers).toHaveLength(5))

    expect(screen.getByRole('button', { name: 'Annuler la dernière action' })).toBeDisabled()
    const apres = (await getPlay('s2'))!
    expect(apres.defense).toBe(false)
    expect(apres.steps[0].markers).toHaveLength(5)
  })

  it('puts the defence at the nearest basket, not always at the front one', async () => {
    // On a full court, an attack in the back court — transition, press — would
    // otherwise have its defender placed at half court, ten metres away.
    const s: Play = { id: 's3', ...newPlay('c1', 'full', false) }
    s.steps[0].markers = s.steps[0].markers.map((p) => ({ ...p, at: { x: p.at.x, y: 0.9 } }))
    await savePlay(s)
    renderEdit('s3')
    await userEvent.click(await screen.findByRole('checkbox', { name: /défense/i }))

    await waitFor(async () => expect((await getPlay('s3'))!.steps[0].markers).toHaveLength(10))
    const croix = (await getPlay('s3'))!.steps[0].markers.filter((p) => p.side === 'defense')
    // The back basket at y ≈ 0.944: the defender is between their attacker and it.
    croix.forEach((c) => expect(c.at.y).toBeGreaterThan(0.9))
  })

  it('the arrow starts from the marker\'s position, not from the point touched', async () => {
    // A finger lands within a grab radius: starting from the point touched would
    // detach the stroke from the marker, and the animation would start the player
    // beside themselves.
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await board()
    // The point guard is at (0.5, 0.62); we touch clearly beside them, within the grab
    // radius.
    fireEvent.pointerDown(svg, { clientX: 160, clientY: 182 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 220 })
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 250 })

    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
    const f = (await getPlay('s1'))!.steps[0].arrows[0]
    expect(f.points[0]).toEqual({ x: 0.5, y: 0.62 })
  })

  it('the scorer\'s table does not open the editor: it is redirected to the reading screen, writing nothing', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    const { container } = render(
      <MemoryRouter initialEntries={['/schemas/s1/edit']}>
        <AuthProvider>
          <Routes>
            <Route path="/schemas/:id/edit" element={<PlayEdit />} />
            <Route path="/schemas/:id" element={<p>consultation</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    // The editor writes on every gesture: without the right it does not open at all,
    // rather than demanding a code for every stroke drawn.
    expect(await screen.findByText('consultation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Course' })).not.toBeInTheDocument()
    // What matters: nothing is written to the store, nor shown on screen.
    expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(0)
    expect(container.querySelectorAll('[data-stroke="cut"]')).toHaveLength(0)
  })
})

/**
 * The shape of a path, and the magnet at its end.
 *
 * Two axes, deliberately kept apart: the four strokes say what a movement *is* — and
 * that is what the animation and the ball transfer read — while the shape says how it
 * gets there. A cut behind a screen is a curve; a pass across the key is a line.
 *
 * The magnet is the part that must not depend on that choice. A pass ending *near* 2
 * rather than *on* 2 is, to the model, a pass to nobody.
 */
describe('SchemaEdit — the shape of a path', () => {
  /** Player 1 sits at (0.5, 0.62) → (150, 174) on the test court; player 2 at
   *  (0.22, 0.48) → (66, 134). */
  const drawWobble = async (svg: Element) => {
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 140, clientY: 150 })
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 148 })
    fireEvent.pointerUp(svg, { clientX: 70, clientY: 136 })
  }

  it('straight keeps the two ends and nothing between', async () => {
    // The sampled curve carried every wobble of a finger on glass, and `anim.refit`
    // then stretched that wobble between the two steps' positions.
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    await drawWobble(await board())
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
    expect((await getPlay('s1'))!.steps[0].arrows[0].points).toHaveLength(2)
  })

  it('freehand keeps the gesture', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    await userEvent.click(screen.getByRole('button', { name: 'Libre' }))
    await drawWobble(await board())
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
    expect((await getPlay('s1'))!.steps[0].arrows[0].points.length).toBeGreaterThan(2)
  })

  it('magnetises the end onto the marker, whichever shape is chosen', async () => {
    // A curved pass has to hand the ball over as surely as a straight one, and that
    // only works if the end really is the marker's position.
    for (const shape of ['Droit', 'Libre']) {
      await savePlay(halfCourtPlay())
      const view = renderEdit('s1')
      await userEvent.click(await screen.findByRole('button', { name: 'Passe' }))
      await userEvent.click(screen.getByRole('button', { name: shape }))
      await drawWobble(await board())

      await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
      const arrow = (await getPlay('s1'))!.steps[0].arrows[0]
      // Released at (70, 136) — a few pixels off player 2, who is at (0.22, 0.48).
      expect(arrow.points.at(-1)).toEqual({ x: 0.22, y: 0.48 })
      view.unmount()
    }
  })

  it('offers the choice only while a stroke tool is held', async () => {
    // A control that cannot act on anything is noise, and this toolbar is dense.
    renderEdit('s1')
    await screen.findByRole('application')
    expect(screen.queryByRole('button', { name: 'Libre' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Écran' }))
    expect(screen.getByRole('button', { name: 'Droit' })).toHaveAttribute('aria-pressed', 'true')
    // The pen has no shape to choose: it is freehand by nature.
    await userEvent.click(screen.getByRole('button', { name: 'Pinceau' }))
    expect(screen.queryByRole('button', { name: 'Libre' })).not.toBeInTheDocument()
  })
})

/**
 * Five players per side, and a freed number comes back.
 *
 * Players are placed and erased one at a time, but five per side is the game: a sixth
 * marker would carry a number naming a poste that does not exist. And the number a
 * departing player leaves is **reused** — erase the 3, place one, and they are the 3
 * again.
 */
describe('SchemaEdit — five per side', () => {
  /** Player 1 sits at (0.5, 0.62) → (150, 174) on the test court. */
  const tapCourt = async (x: number, y: number) => {
    const svg = await board()
    fireEvent.pointerDown(svg, { clientX: x * 300, clientY: y * 280 })
    fireEvent.pointerUp(svg, { clientX: x * 300, clientY: y * 280 })
  }

  const place = async (what: string) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Poser' }))
    await userEvent.click(screen.getByRole('button', { name: what }))
  }

  it('greys the control out on a full side, and says why', async () => {
    renderEdit('s1')
    await place('Plot')                              // reachable: the props are never full
    const ally = screen.getByRole('button', { name: 'Joueur' })
    expect(ally).toBeDisabled()
    expect(ally).toHaveAttribute('title', '5 joueurs au maximum par équipe.')
    // A disabled control must not also claim to be the selected one.
    expect(ally).toHaveAttribute('aria-pressed', 'false')
  })

  it('the eraser takes the player out of every step', async () => {
    const s = halfCourtPlay()
    s.steps = [s.steps[0], { ...s.steps[0], markers: [...s.steps[0].markers] }]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Gomme' }))
    // (0.5, 0.62): player 1, at the top of the key.
    await tapCourt(0.5, 0.62)

    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].markers).toHaveLength(4))
    expect((await getPlay('s1'))!.steps[1].markers).toHaveLength(4)
  })

  it('gives the freed number back to the next player placed', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Gomme' }))
    await tapCourt(0.5, 0.62)                        // player 1 goes
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].markers).toHaveLength(4))

    await place('Joueur')
    await tapCourt(0.8, 0.8)                         // and one comes back, in the corner

    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].markers).toHaveLength(5))
    const positions = (await getPlay('s1'))!.steps[0].markers.map((m) => m.position).sort()
    expect(positions).toEqual([1, 2, 3, 4, 5])
  })
})
