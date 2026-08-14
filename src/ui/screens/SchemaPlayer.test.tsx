import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaPlayer } from './SchemaPlayer'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { savePlay } from '../../persistence/repositories'
import { nouveauSchema, tempsSuivant, type Schema } from '../../domain/plays'

/** Deux temps : le meneur descend de 0,62 à 0,20 ; personne d'autre ne bouge.
 *  Sa course est tracée droite, pour que le trajet reste la corde. */
const deuxTemps = (): Schema => {
  const s: Schema = { id: 's1', ...nouveauSchema('ta', 'demi', false), nom: 'Corner pour le 4' }
  const t0 = {
    ...s.temps[0],
    fleches: [{ depuis: { camp: 'attaque' as const, poste: 1 as const }, trait: 'course' as const, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }] }],
  }
  const t1 = tempsSuivant(t0)
  t1.pions = t1.pions.map((p) => (p.poste === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  return { ...s, temps: [t0, t1] }
}

/** Les deux ordonnées du meneur dans les unités du viewBox (profondeur 1400). */
const DEPART = 0.62 * 1400
const ARRIVEE = 0.2 * 1400
const MILIEU = (DEPART + ARRIVEE) / 2

/** Ce que le système répond à `prefers-reduced-motion`, réglé test par test. */
let moinsDeMouvement = false

beforeEach(async () => {
  moinsDeMouvement = false
  // jsdom n'a pas `matchMedia` : sans cette doublure, le lecteur ne peut pas
  // demander au système s'il faut supprimer l'interpolation.
  window.matchMedia = ((media: string) => ({
    media, matches: moinsDeMouvement, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
  sessionStorage.removeItem(ROLE_KEY)
  await db.plays.clear()
  await savePlay(deuxTemps())
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/**
 * Rend le lecteur, attend que le schéma soit chargé, puis passe aux minuteurs
 * simulés : en jsdom rien n'avance tout seul, et une boucle d'animation qu'on
 * ne pilote pas donnerait des tests qui passent sans rien prouver.
 */
async function ouvrir() {
  render(
    <MemoryRouter initialEntries={['/schemas/s1/lecteur']}>
      <AuthProvider>
        <Routes>
          <Route path="/schemas/:id/lecteur" element={<SchemaPlayer />} />
          <Route path="/schemas/:id" element={<p>consultation</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('img', { name: /tableau tactique/ })
  vi.useFakeTimers()
}

const avancer = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom })

/**
 * L'ordonnée du meneur telle que le tableau la dessine : la seule preuve que la
 * lecture déplace vraiment quelque chose, plutôt qu'un compteur d'écran.
 */
function ordonneeDuMeneur(): number {
  const groupe = [...document.querySelectorAll('g[data-pion="attaque"]')]
    .find((n) => n.querySelector('text')?.textContent === '1')
  return Number(groupe!.querySelector('circle')!.getAttribute('cy'))
}

describe('SchemaPlayer — le lecteur du temps-mort', () => {
  it('un visiteur ouvre le lecteur et fait défiler sans qu’aucun code lui soit demandé', async () => {
    await ouvrir()
    // Aucun rôle en session : la lecture n'est jamais protégée, un joueur ouvre
    // la combinaison chez lui.
    expect(screen.getByRole('img', { name: 'tableau tactique — Corner pour le 4' })).toBeInTheDocument()
    fireEvent.click(bouton('Temps suivant'))
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
    // Un écran plein sans sortie visible est un piège.
    expect(screen.getByRole('link', { name: /Quitter/ })).toHaveAttribute('href', '/schemas/s1')
  })

  it('les deux zones tactiles avancent et reculent d’un temps, bornées aux extrémités', async () => {
    await ouvrir()
    const precedent = bouton('Temps précédent')
    const suivant = bouton('Temps suivant')

    // Au premier temps, reculer ne fait rien : la zone est éteinte et le tableau
    // ne bouge pas. Boucler ici ferait croire qu'il reste des temps derrière.
    expect(precedent).toBeDisabled()
    fireEvent.click(precedent)
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)

    fireEvent.click(suivant)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
    expect(screen.getByText('Temps 2 / 2')).toBeInTheDocument()

    // Au dernier temps, avancer ne fait rien non plus.
    expect(suivant).toBeDisabled()
    fireEvent.click(suivant)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)

    fireEvent.click(precedent)
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
  })

  it('depuis une pause à mi-transition, la zone suivante n’enjambe pas un temps', async () => {
    // Trois temps : le meneur descend par paliers. En pause à 70 % du premier
    // mouvement, « suivant » doit poser sur le temps 2 — arrondir au plus proche
    // le ferait sauter au temps 3, et le coach ne verrait jamais l'étape qu'il
    // s'était arrêté pour commenter.
    const s = deuxTemps()
    const t2 = tempsSuivant(s.temps[1])
    t2.pions = t2.pions.map((p) => (p.poste === 1 ? { ...p, at: { x: 0.5, y: 0.05 } } : p))
    await db.plays.clear()
    await savePlay({ ...s, temps: [...s.temps, t2] })

    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    avancer(1050)                                   // 70 % de la première transition
    fireEvent.click(bouton('Pause'))
    fireEvent.click(bouton('Temps suivant'))

    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)   // le temps 2, pas le temps 3
  })

  it('« Lecture » joue la combinaison, « Pause » la laisse où elle en est', async () => {
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    // Une transition dure 1,5 s : à mi-course, le meneur est à mi-chemin.
    avancer(750)
    expect(ordonneeDuMeneur()).toBeCloseTo(MILIEU, 0)

    fireEvent.click(bouton('Pause'))
    const arret = ordonneeDuMeneur()
    avancer(3000)
    expect(ordonneeDuMeneur()).toBe(arret)
    expect(bouton('Lecture')).toBeInTheDocument()
  })

  it('la lecture s’arrête au dernier temps, et la boucle repart du premier', async () => {
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    avancer(2000)
    // Sans boucle : on s'arrête net sur le dernier temps.
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
    expect(bouton('Lecture')).toBeInTheDocument()

    // Avec la boucle, le dernier temps tenu, on repart du premier et ça continue.
    fireEvent.click(bouton('Boucle'))
    fireEvent.click(bouton('Lecture'))
    avancer(1600)
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
    expect(bouton('Pause')).toBeInTheDocument()
  })

  it('le ralenti double la durée d’une transition', async () => {
    await ouvrir()
    fireEvent.click(bouton('Ralenti'))
    fireEvent.click(bouton('Lecture'))
    // 1,5 s au ralenti, c'est la moitié du chemin : à pleine vitesse on serait arrivé.
    avancer(1500)
    expect(ordonneeDuMeneur()).toBeCloseTo(MILIEU, 0)
    avancer(1500)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
  })

  it('sous « prefers-reduced-motion », la lecture saute d’un temps au suivant', async () => {
    moinsDeMouvement = true
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    // Pas d'interpolation du tout : à mi-course on est encore exactement au
    // premier temps, puis on bascule d'un coup sur le second.
    avancer(750)
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
    avancer(750)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
  })

  it('les traits du carnet s’effacent pendant la lecture et reviennent à l’arrêt', async () => {
    await ouvrir()
    const traits = () => document.querySelectorAll('g[data-trait]').length
    // Arrêté sur un temps, on relit le dessin du coach.
    expect(traits()).toBe(1)
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    // En mouvement, les traits satureraient l'image — c'est ce que l'animation remplace.
    expect(traits()).toBe(0)
    fireEvent.click(bouton('Pause'))
    fireEvent.click(bouton('Temps suivant'))
    fireEvent.click(bouton('Temps précédent'))
    expect(traits()).toBe(1)
  })

  it('la lecture se met en pause quand l’onglet passe en arrière-plan', async () => {
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    const arret = ordonneeDuMeneur()

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    avancer(3000)
    // Sur un téléphone, une animation qui tourne en arrière-plan vide la
    // batterie et se retrouve à un endroit imprévu au retour.
    expect(ordonneeDuMeneur()).toBe(arret)
    expect(bouton('Lecture')).toBeInTheDocument()
  })
})
