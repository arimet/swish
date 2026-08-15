/**
 * Ce qui se teste honnêtement ici, et ce qui ne s'y teste pas.
 *
 * jsdom ne rend rien dans un canvas : `getContext('2d')` y renvoie `null` et
 * `toBlob` n'existe pas. Un test qui prétendrait vérifier le contenu d'un PNG,
 * d'un PDF ou d'un GIF ne prouverait donc rien — il ne pourrait même pas tomber.
 * Les trois sorties fichier se vérifient au navigateur, pas ici.
 *
 * Restent, et ce sont les propriétés qui comptent : le dialogue propose bien les
 * quatre sorties, le lien porte réellement le schéma (aller-retour par
 * `decoder`), un schéma trop chargé n'en produit pas, la remise du fichier passe
 * par le partage natif quand il existe et par le téléchargement sinon, et
 * partager ne demande jamais de code.
 */
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportSchema, livrer } from './ExportSchema'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { decoder } from '../../domain/partage'
import { newPlay, nextStep, type Arrow, type Play } from '../../domain/plays'
import { db } from '../../persistence/db'
import { savePlay } from '../../persistence/repositories'
import { SchemaView } from '../screens/SchemaView'

const deuxTemps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', true), name: 'Pick and roll haut', note: 'Écran au meneur' }
  const t0 = {
    ...s.steps[0],
    arrows: [{ from: { side: 'offense' as const, position: 5 as const }, stroke: 'screen' as const, points: [{ x: 0.7, y: 0.2 }, { x: 0.55, y: 0.5 }] }],
  }
  return { ...s, steps: [t0, nextStep(t0)] }
}

/**
 * Un schéma que le lien ne peut pas porter. Les points sont tirés au hasard :
 * un tracé régulier se compresserait presque à néant, et le test ne dirait plus
 * rien de la limite.
 */
const troisMilleGestes = (): Play => {
  const s = deuxTemps()
  const arrows: Arrow[] = Array.from({ length: 24 }, () => ({
    from: { side: 'offense' as const, position: 1 as const },
    stroke: 'cut' as const,
    points: Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random() })),
  }))
  return { ...s, steps: [{ ...s.steps[0], arrows }, s.steps[1]] }
}

const ouvrir = (schema: Play) =>
  render(<ExportSchema schema={schema} stepIndex={0} open onClose={() => {}} />)

/** Le lien tel que le dialogue le donne à copier. */
const lienAffiche = async () =>
  (await screen.findByLabelText<HTMLInputElement>('Lien de la combinaison')).value

beforeEach(() => { sessionStorage.removeItem(ROLE_KEY) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ExportSchema — le partage d’une combinaison', () => {
  it('propose les quatre sorties : le lien d’abord, puis l’image, le PDF et le GIF', async () => {
    ouvrir(deuxTemps())

    expect(await screen.findByRole('button', { name: /Copier le lien/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GIF animé' })).toBeInTheDocument()
    // §6 du spec : l'écran explique pourquoi le lien est long, sans quoi on le
    // prendrait pour un dysfonctionnement.
    expect(screen.getByText(/contient la combinaison entière/)).toBeInTheDocument()
  })

  it('le lien porte réellement le schéma : rouvrir son fragment rend l’original', async () => {
    const original = deuxTemps()
    ouvrir(original)

    const lien = new URL(await lienAffiche())
    expect(lien.pathname).toBe('/schemas/recu')
    // Le schéma voyage dans le fragment, jamais dans la requête.
    expect(lien.search).toBe('')
    expect(lien.hash.length).toBeGreaterThan(1)

    const recu = await decoder(lien.hash.slice(1))
    expect(recu).not.toBeNull()
    expect(recu!.name).toBe(original.name)
    expect(recu!.note).toBe(original.note)
    expect(recu!.defense).toBe(true)
    expect(recu!.steps).toEqual(original.steps)
  })

  it('au-delà de la limite, aucun lien n’est proposé et l’écran dit pourquoi', async () => {
    ouvrir(troisMilleGestes())

    expect(await screen.findByText(/trop chargée pour tenir dans un lien/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Lien de la combinaison')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copier le lien/ })).not.toBeInTheDocument()
    // Les sorties fichier, elles, restent : c'est justement ce qu'on propose à la place.
    expect(screen.getByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
  })

  it('copier le lien passe aussi par le partage natif quand l’appareil en a un', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, {
      share: { value: share },
      clipboard: { value: { writeText: vi.fn().mockResolvedValue(undefined) } },
    }))
    ouvrir(deuxTemps())
    const lien = await lienAffiche()

    await userEvent.click(screen.getByRole('button', { name: /Copier le lien/ }))

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Pick and roll haut', url: lien }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(lien)
  })

  it('sans partage natif, le lien va au moins dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }))
    ouvrir(deuxTemps())
    const lien = await lienAffiche()

    await userEvent.click(screen.getByRole('button', { name: /Copier le lien/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(lien))
    expect(await screen.findByText('Lien copié.')).toBeInTheDocument()
  })

  it('un fichier part par le partage natif s’il existe, et se télécharge sinon', async () => {
    // La fabrication du PNG, du PDF et du GIF ne peut pas être exercée en jsdom
    // (pas de canvas) ; leur **remise**, si — et c'est elle qui décide entre le
    // geste du téléphone et celui du bureau.
    const file = new File(['x'], 'pick-and-roll.png', { type: 'image/png' })
    vi.stubGlobal('URL', Object.create(URL, {
      createObjectURL: { value: vi.fn(() => 'blob:faux') },
      revokeObjectURL: { value: vi.fn() },
    }))
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.create(navigator, { share: { value: share } }))
    await livrer(file)
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'pick-and-roll.png' })
    expect(clic).not.toHaveBeenCalled()

    vi.stubGlobal('navigator', Object.create(navigator, { share: { value: undefined } }))
    await livrer(file)
    expect(clic).toHaveBeenCalledTimes(1)
  })

  it('partager ne demande aucun code, même sans aucun rôle', async () => {
    await db.plays.clear()
    await savePlay(deuxTemps())
    render(
      <MemoryRouter initialEntries={['/schemas/s1']}>
        <AuthProvider>
          <Routes><Route path="/schemas/:id" element={<SchemaView />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('img', { name: /tableau tactique/ })

    await userEvent.click(screen.getByRole('button', { name: /Partager/ }))

    expect(await screen.findByRole('button', { name: 'Image PNG' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
  })
})
