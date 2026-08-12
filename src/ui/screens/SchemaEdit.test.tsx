import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SchemaEdit } from './SchemaEdit'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { getPlay, savePlay } from '../../persistence/repositories'
import { nouveauSchema, type Fleche, type Schema } from '../../domain/plays'

// jsdom ne mesure rien : `getBoundingClientRect` rend des zéros, et la conversion
// écran → SVG (`versSvg`) renverrait alors des points nuls pour tous les gestes.
// Un terrain de 300 × 280 px posé à l'origine rend les coordonnées des tests
// lisibles : x px / 300 et y px / 280 donnent directement les normalisées.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 280, width: 300, height: 280, toJSON: () => ({}) } as DOMRect
  }
})

const schemaDemi = (): Schema => ({ id: 's1', ...nouveauSchema('c1', 'demi', false) })

// Une course du meneur vers l'aile : sert de flèche de départ aux cas qui
// gomment, annulent ou ajoutent un temps sans avoir à la tracer d'abord.
const course: Fleche = { depuis: { camp: 'attaque', poste: 1 }, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.3 }], trait: 'course' }

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  await db.plays.clear()
  await savePlay(schemaDemi())
})

const renderEdit = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/schemas/${id}/edit`]}>
      <AuthProvider>
        <Routes><Route path="/schemas/:id/edit" element={<SchemaEdit />} /></Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

// Le tableau interactif porte le rôle `application` ; les vignettes de la bande
// des temps sont des `img`. C'est ce qui les distingue, leur nom accessible étant
// le même.
const tableau = async () => await screen.findByRole('application')

describe('SchemaEdit — l’éditeur du tableau tactique', () => {
  it('trace une flèche de course depuis un pion et l’enregistre', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await tableau()
    // du meneur (0.5, 0.62) → (150, 173.6) px vers le corner (30, 250)
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 220 })
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 250 })
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(1))
    expect((await getPlay('s1'))!.temps[0].fleches[0].trait).toBe('course')
    expect((await getPlay('s1'))!.temps[0].fleches[0].depuis).toEqual({ camp: 'attaque', poste: 1 })
  })

  it('ignore un tracé qui ne part pas d’un pion', async () => {
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await tableau()
    // (0.05, 0.9) : le coin du terrain, aucun pion à portée de prise
    fireEvent.pointerDown(svg, { clientX: 15, clientY: 252 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 200 })
    fireEvent.pointerUp(svg, { clientX: 150, clientY: 100 })
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(0))
  })

  it('la gomme retire une flèche ; annuler la restaure', async () => {
    const s = schemaDemi()
    s.temps[0].fleches = [course]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Gomme' }))
    // (0.5, 0.45) : au milieu du trait de la course
    fireEvent.pointerDown(await tableau(), { clientX: 150, clientY: 126 })
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(0))

    await userEvent.click(screen.getByRole('button', { name: /annuler/i }))
    // Annuler restaure la base, pas seulement l'écran.
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(1))
  })

  it('« + » ajoute un temps qui hérite des positions, pas des flèches', async () => {
    const s = schemaDemi()
    s.temps[0].fleches = [course]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: '+ Temps' }))
    await waitFor(async () => expect((await getPlay('s1'))!.temps).toHaveLength(2))
    const apres = (await getPlay('s1'))!
    expect(apres.temps[1].pions).toEqual(apres.temps[0].pions)
    expect(apres.temps[1].ballon).toEqual(apres.temps[0].ballon)
    expect(apres.temps[1].fleches).toEqual([])
  })

  it('refuse le passage en demi-terrain quand la moitié arrière est occupée', async () => {
    const s: Schema = { id: 's1', ...nouveauSchema('c1', 'complet', false) }
    s.temps[0].pions[0] = { ...s.temps[0].pions[0], at: { x: 0.5, y: 0.8 } }
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Demi-terrain' }))
    // Le refus nomme son occupant, et le terrain enregistré ne bouge pas.
    expect(await screen.findByText(/le poste 1 occupe la moitié arrière/i)).toBeInTheDocument()
    expect((await getPlay('s1'))!.terrain).toBe('complet')
  })

  it('n’annule pas dans l’ancienne échelle après un changement de terrain', async () => {
    // Les étapes empilées portent les coordonnées d'avant le remappage. Les
    // restaurer telles quelles replacerait les pions n'importe où — au pire dans
    // la moitié arrière, celle que le demi-terrain refuse justement.
    renderEdit('s1')
    const svg = await tableau()
    // Un déplacement de pion, pour avoir quelque chose à annuler.
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 240 })
    fireEvent.pointerUp(svg, { clientX: 120, clientY: 240 })
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].pions[0].at.y).toBeCloseTo(0.857, 2))

    await userEvent.click(screen.getByRole('button', { name: 'Terrain complet' }))
    await waitFor(async () => expect((await getPlay('s1'))!.terrain).toBe('complet'))

    // La pile est vidée : plus rien à annuler, donc rien à restaurer de travers.
    expect(screen.getByRole('button', { name: /↩ Annuler/ })).toBeDisabled()
    expect((await getPlay('s1'))!.temps[0].pions[0].at.y).toBeCloseTo(0.4285, 3)
  })

  it('la table de marque ne peut pas modifier : le tracé demande le code admin', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    const { container } = renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await tableau()
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 220 })
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 250 })
    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(0)
    // Garder d'abord, muter ensuite : tant que le code n'est pas donné, l'écran ne
    // doit pas non plus montrer la flèche — sinon le coach croirait l'avoir tracée.
    expect(container.querySelectorAll('[data-trait="course"]')).toHaveLength(0)
  })
})
