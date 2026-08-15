import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayEdit } from './PlayEdit'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
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

const schemaDemi = (): Play => ({ id: 's1', ...newPlay('c1', 'half', false) })

// A cut from the point guard towards the wing: serves as the starting arrow for the
// cases that erase, undo or add a step without having to draw it first.
const cut: Arrow = { from: { side: 'offense', position: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.3 }], stroke: 'cut' }

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await db.plays.clear()
  await savePlay(schemaDemi())
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
// le même.
const tableau = async () => await screen.findByRole('application')

describe('SchemaEdit — the playbook editor', () => {
  it('groups the tools by family and says which is active', async () => {
    // Eight pills of equal weight did not say that they do three different things. The
    // four strokes are mutually exclusive: they form their own segment, and each keeps
    // its accessible name — it is the word that gives way to the pictogram, not the
    // label.
    renderEdit('s1')
    const tracer = await screen.findByRole('group', { name: 'Tracer' })
    expect(within(tracer).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Course', 'Écran', 'Passe', 'Dribble'])
    expect(within(screen.getByRole('group', { name: 'Manipuler' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Déplacer', 'Gomme'])
    expect(within(screen.getByRole('group', { name: 'Poser' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Ballon', 'Objets'])

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
    const svg = await tableau()
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
    const svg = await tableau()
    // (0.05, 0.9): the court's corner, no marker within grab range
    fireEvent.pointerDown(svg, { clientX: 15, clientY: 252 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 200 })
    fireEvent.pointerUp(svg, { clientX: 150, clientY: 100 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(0))
  })

  it('the eraser removes an arrow; undo restores it', async () => {
    const s = schemaDemi()
    s.steps[0].arrows = [cut]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Gomme' }))
    // (0.5, 0.45): in the middle of the cut's stroke
    fireEvent.pointerDown(await tableau(), { clientX: 150, clientY: 126 })
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(0))

    await userEvent.click(screen.getByRole('button', { name: 'Annuler la dernière action' }))
    // Undo restores the store, not only the screen.
    await waitFor(async () => expect((await getPlay('s1'))!.steps[0].arrows).toHaveLength(1))
  })

  it('"+" adds a step that inherits the positions, not the arrows', async () => {
    const s = schemaDemi()
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
    const svg = await tableau()
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
    const svg = await tableau()
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
    const svg = await tableau()
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
