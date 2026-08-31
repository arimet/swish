/**
 * What can honestly be tested here, and what cannot.
 *
 * jsdom renders nothing into a canvas: `getContext('2d')` returns `null` there and
 * `toBlob` does not exist. A test claiming to check the contents of a PNG, a PDF or a
 * GIF would therefore prove nothing — it could not even fail. The three file outputs
 * are verified in a browser, not here.
 *
 * What remains are the properties that matter: the dialog does offer the four outputs,
 * the link really carries the play (a round trip through `decode`), a play too heavy
 * produces none, handing over the file goes through the native share when there is one
 * and through a download otherwise, and sharing never asks for a code.
 */
import { render, screen, waitFor } from '../../test/render'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharePlay, deliver } from './SharePlay'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { decode } from '../../domain/share'
import { newPlay, nextStep, type Arrow, type Play } from '../../domain/plays'
import { savePlay } from '../../persistence/repositories'
import { PlayView } from '../screens/PlayView'
import { clear } from '../../test/fakeApi'

const twoSteps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', true), name: 'Pick and roll haut', note: 'Écran au meneur' }
  const t0 = {
    ...s.steps[0],
    arrows: [{ from: { side: 'offense' as const, position: 5 as const }, stroke: 'screen' as const, points: [{ x: 0.7, y: 0.2 }, { x: 0.55, y: 0.5 }] }],
  }
  return { ...s, steps: [t0, nextStep(t0)] }
}

/**
 * A play the link cannot carry. The points are drawn at random: a regular stroke
 * would compress almost to nothing, and the test would no longer say anything about
 * the limit.
 */
const threeThousandGestures = (): Play => {
  const s = twoSteps()
  const arrows: Arrow[] = Array.from({ length: 24 }, () => ({
    from: { side: 'offense' as const, position: 1 as const },
    stroke: 'cut' as const,
    points: Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random() })),
  }))
  return { ...s, steps: [{ ...s.steps[0], arrows }, s.steps[1]] }
}

const open = (play: Play) =>
  render(<SharePlay play={play} stepIndex={0} open onClose={() => {}} />)

/** The link as the dialog offers it for copying. */
const lienAffiche = async () =>
  (await screen.findByLabelText<HTMLInputElement>('Lien de la combinaison')).value

beforeEach(() => { sessionStorage.removeItem(ROLE_KEY) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ExportSchema — sharing a play', () => {
  it('offers the four outputs: the link first, then the image, the PDF and the GIF', async () => {
    open(twoSteps())

    expect(await screen.findByRole('button', { name: /Copier le lien/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GIF animé' })).toBeInTheDocument()
    // Spec §6: the screen explains why the link is long, otherwise it would be taken
    // for a malfunction.
    expect(screen.getByText(/contient la combinaison entière/)).toBeInTheDocument()
  })

  it('the link really carries the play: reopening its fragment returns the original', async () => {
    const original = twoSteps()
    open(original)

    const lien = new URL(await lienAffiche())
    expect(lien.pathname).toBe('/schemas/recu')
    // The play travels in the fragment, never in the query string.
    expect(lien.search).toBe('')
    expect(lien.hash.length).toBeGreaterThan(1)

    const recu = await decode(lien.hash.slice(1))
    expect(recu).not.toBeNull()
    expect(recu!.name).toBe(original.name)
    expect(recu!.note).toBe(original.note)
    expect(recu!.defense).toBe(true)
    expect(recu!.steps).toEqual(original.steps)
  })

  it('past the limit no link is offered, and the screen says why', async () => {
    open(threeThousandGestures())

    expect(await screen.findByText(/trop chargée pour tenir dans un lien/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Lien de la combinaison')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copier le lien/ })).not.toBeInTheDocument()
    // The file outputs stay: they are precisely what is offered instead.
    expect(screen.getByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
  })

  it('copying the link also goes through the native share when the device has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, {
      share: { value: share },
      clipboard: { value: { writeText: vi.fn().mockResolvedValue(undefined) } },
    }))
    open(twoSteps())
    const lien = await lienAffiche()

    await userEvent.click(screen.getByRole('button', { name: /Copier le lien/ }))

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Pick and roll haut', url: lien }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(lien)
  })

  it('without a native share, the link at least reaches the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }))
    open(twoSteps())
    const lien = await lienAffiche()

    await userEvent.click(screen.getByRole('button', { name: /Copier le lien/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(lien))
    expect(await screen.findByText('Lien copié.')).toBeInTheDocument()
  })

  it('a file leaves through the native share if there is one, and downloads otherwise', async () => {
    // Building the PNG, the PDF and the GIF cannot be exercised in jsdom (no canvas);
    // **handing them over** can — and that is what decides between the phone's gesture
    // and the desktop's.
    const file = new File(['x'], 'pick-and-roll.png', { type: 'image/png' })
    vi.stubGlobal('URL', Object.create(URL, {
      createObjectURL: { value: vi.fn(() => 'blob:faux') },
      revokeObjectURL: { value: vi.fn() },
    }))
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, { share: { value: share } }))
    await deliver(file)
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'pick-and-roll.png' })
    expect(clic).not.toHaveBeenCalled()

    vi.stubGlobal('navigator', Object.create(navigator, { share: { value: undefined } }))
    await deliver(file)
    expect(clic).toHaveBeenCalledTimes(1)
  })

  it('sharing asks for no code, even with no role at all', async () => {
    clear('play')
    await savePlay(twoSteps())
    render(
      <MemoryRouter initialEntries={['/schemas/s1']}>
        <AuthProvider>
          <Routes><Route path="/schemas/:id" element={<PlayView />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('img', { name: /tableau tactique/ })

    await userEvent.click(screen.getByRole('button', { name: /Partager/ }))

    expect(await screen.findByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
  })
})
