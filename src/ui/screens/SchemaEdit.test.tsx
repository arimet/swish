import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('range les outils par famille et dit lequel est actif', async () => {
    // Huit pastilles de même poids ne disaient pas qu'elles font trois choses
    // différentes. Les quatre traits s'excluent : ils forment leur propre segment,
    // et chacun garde son nom accessible — c'est le mot qui cède la place au
    // pictogramme, pas l'étiquette.
    renderEdit('s1')
    const tracer = await screen.findByRole('group', { name: 'Tracer' })
    expect(within(tracer).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Course', 'Écran', 'Passe', 'Dribble'])
    expect(within(screen.getByRole('group', { name: 'Manipuler' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Déplacer', 'Gomme'])
    expect(within(screen.getByRole('group', { name: 'Poser' })).getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))).toEqual(['Ballon', 'Objets'])

    // Un seul outil actif à la fois, et il le dit — sans quoi on trace sans savoir quoi.
    expect(screen.getByRole('button', { name: 'Déplacer' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Passe' }))
    expect(screen.getByRole('button', { name: 'Passe' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Déplacer' })).toHaveAttribute('aria-pressed', 'false')
  })

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

    await userEvent.click(screen.getByRole('button', { name: 'Annuler la dernière action' }))
    // Annuler restaure la base, pas seulement l'écran.
    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(1))
  })

  it('« + » ajoute un temps qui hérite des positions, pas des flèches', async () => {
    const s = schemaDemi()
    s.temps[0].fleches = [course]
    await savePlay(s)
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un temps' }))
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
    expect(screen.getByRole('button', { name: 'Annuler la dernière action' })).toBeDisabled()
    expect((await getPlay('s1'))!.temps[0].pions[0].at.y).toBeCloseTo(0.4285, 3)
  })

  it('n’annule pas une défense retirée : le schéma ne repasse pas à dix pions', async () => {
    // Une étape empilée porte dix pions ; la restaurer après le retrait de la
    // défense écrirait `defense: false` avec ses croix — l'invariante « cinq ou
    // dix pions selon `defense` » cassée, et écrite en base.
    const s: Schema = { id: 's2', ...nouveauSchema('c1', 'demi', true) }
    await savePlay(s)
    renderEdit('s2')
    const svg = await tableau()
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 174 })
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 240 })
    fireEvent.pointerUp(svg, { clientX: 120, clientY: 240 })
    await waitFor(async () => expect((await getPlay('s2'))!.temps[0].pions).toHaveLength(10))

    await userEvent.click(screen.getByRole('checkbox', { name: /défense/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(async () => expect((await getPlay('s2'))!.temps[0].pions).toHaveLength(5))

    expect(screen.getByRole('button', { name: 'Annuler la dernière action' })).toBeDisabled()
    const apres = (await getPlay('s2'))!
    expect(apres.defense).toBe(false)
    expect(apres.temps[0].pions).toHaveLength(5)
  })

  it('pose la défense au panier le plus proche, pas toujours au panier avant', async () => {
    // Sur terrain complet, une attaque dans la moitié arrière — transition, presse —
    // verrait sinon son défenseur posé au milieu du terrain, à dix mètres d'elle.
    const s: Schema = { id: 's3', ...nouveauSchema('c1', 'complet', false) }
    s.temps[0].pions = s.temps[0].pions.map((p) => ({ ...p, at: { x: p.at.x, y: 0.9 } }))
    await savePlay(s)
    renderEdit('s3')
    await userEvent.click(await screen.findByRole('checkbox', { name: /défense/i }))

    await waitFor(async () => expect((await getPlay('s3'))!.temps[0].pions).toHaveLength(10))
    const croix = (await getPlay('s3'))!.temps[0].pions.filter((p) => p.camp === 'defense')
    // Panier arrière à y ≈ 0,944 : le défenseur est entre son attaquant et lui.
    croix.forEach((c) => expect(c.at.y).toBeGreaterThan(0.9))
  })

  it('la flèche part de la position du pion, pas du point touché', async () => {
    // Le doigt tombe à un rayon de prise près : partir du point touché détacherait
    // le trait du pion, et l'animation de 8B ferait démarrer le joueur à côté.
    renderEdit('s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Course' }))
    const svg = await tableau()
    // Le meneur est en (0.5, 0.62) ; on touche nettement à côté, dans le rayon de prise.
    fireEvent.pointerDown(svg, { clientX: 160, clientY: 182 })
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 220 })
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 250 })

    await waitFor(async () => expect((await getPlay('s1'))!.temps[0].fleches).toHaveLength(1))
    const f = (await getPlay('s1'))!.temps[0].fleches[0]
    expect(f.points[0]).toEqual({ x: 0.5, y: 0.62 })
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
