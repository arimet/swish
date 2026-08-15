import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaPlayer } from './SchemaPlayer'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { db } from '../../persistence/db'
import { savePlay } from '../../persistence/repositories'
import { newPlay, nextStep, type Play } from '../../domain/plays'

/** Deux temps : le meneur descend de 0,62 à 0,20 ; personne d'autre ne bouge.
 *  Sa course est tracée droite, pour que le trajet reste la corde. */
const deuxTemps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', false), name: 'Corner pour le 4' }
  const t0 = {
    ...s.steps[0],
    arrows: [{ from: { side: 'offense' as const, position: 1 as const }, stroke: 'cut' as const, points: [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.2 }] }],
  }
  const t1 = nextStep(t0)
  t1.markers = t1.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.2 } } : p))
  return { ...s, steps: [t0, t1] }
}

/** Les deux ordonnées du meneur dans les unités du viewBox (profondeur 1400). */
const DEPART = 0.62 * 1400
const ARRIVEE = 0.2 * 1400
const MILIEU = (DEPART + ARRIVEE) / 2

/** Ce que le système répond à `prefers-reduced-motion`, réglé test par test. */
let reducedMotion = false

beforeEach(async () => {
  reducedMotion = false
  // jsdom n'a pas `matchMedia` : sans cette doublure, le lecteur ne peut pas
  // demander au système s'il faut supprimer l'interpolation.
  window.matchMedia = ((media: string) => ({
    media, matches: reducedMotion, onchange: null,
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
const bouton = (name: string | RegExp) => screen.getByRole('button', { name: name })

/**
 * L'ordonnée du meneur telle que le tableau la dessine : la seule preuve que la
 * lecture déplace vraiment quelque chose, plutôt qu'un compteur d'écran.
 */
function ordonneeDuMeneur(): number {
  const groupe = [...document.querySelectorAll('g[data-marker="offense"]')]
    .find((n) => n.querySelector('text')?.textContent === '1')
  return Number(groupe!.querySelector('circle')!.getAttribute('cy'))
}

describe('SchemaPlayer — the time-out viewer', () => {
  it('a visitor opens the viewer and steps through without being asked for any code', async () => {
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

  it('the two touch halves step forward and back, clamped at the ends', async () => {
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

  it('from a pause mid-transition, the next half does not stride over a step', async () => {
    // Trois temps : le meneur descend par paliers. En pause à 70 % du premier
    // mouvement, « suivant » doit poser sur le temps 2 — arrondir au plus proche
    // le ferait sauter au temps 3, et le coach ne verrait jamais l'étape qu'il
    // s'était arrêté pour commenter.
    const s = deuxTemps()
    const t2 = nextStep(s.steps[1])
    t2.markers = t2.markers.map((p) => (p.position === 1 ? { ...p, at: { x: 0.5, y: 0.05 } } : p))
    await db.plays.clear()
    await savePlay({ ...s, steps: [...s.steps, t2] })

    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    avancer(1050)                                   // 70 % de la première transition
    fireEvent.click(bouton('Pause'))
    fireEvent.click(bouton('Temps suivant'))

    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)   // le temps 2, pas le temps 3
  })

  it('"Play" runs the play, "Pause" leaves it where it is', async () => {
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

  it('playback stops at the last step, and the loop restarts from the first', async () => {
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

  it('slow motion doubles a transition\'s duration', async () => {
    await ouvrir()
    fireEvent.click(bouton('Ralenti'))
    fireEvent.click(bouton('Lecture'))
    // 1,5 s au ralenti, c'est la moitié du chemin : à pleine vitesse on serait arrivé.
    avancer(1500)
    expect(ordonneeDuMeneur()).toBeCloseTo(MILIEU, 0)
    avancer(1500)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
  })

  it('under prefers-reduced-motion, playback jumps from one step to the next', async () => {
    reducedMotion = true
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    // Pas d'interpolation du tout : à mi-course on est encore exactement au
    // premier temps, puis on bascule d'un coup sur le second.
    avancer(750)
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
    avancer(750)
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
  })

  it('the notebook\'s strokes fade during playback and come back at a stop', async () => {
    await ouvrir()
    const traits = () => document.querySelectorAll('g[data-stroke]').length
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

  it('playback pauses when the tab goes into the background', async () => {
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

/**
 * La bascule des trajets. Ce que le coach demande au temps-mort, c'est de voir
 * *où va* chaque joueur pendant que la combinaison se joue — pas seulement où il
 * en est. Les tests visent le SVG et non l'état interne : un compteur qui change
 * sans que le terrain change ne prouverait rien.
 */
describe('SchemaPlayer — showing the movement paths', () => {
  /** Les trajets tracés sur le terrain, par leur trait. */
  const trajets = () => [...document.querySelectorAll('g[data-stroke]')].map((n) => n.getAttribute('data-stroke'))

  it('the toggle exists and starts off', async () => {
    await ouvrir()
    expect(bouton('Trajets')).toHaveAttribute('aria-pressed', 'false')
  })

  it('without it, playback shows no path', async () => {
    // Le comportement d'avant, préservé : pendant l'animation, les joueurs seuls.
    await ouvrir()
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toEqual([])
  })

  it('with it, playback shows the point guard\'s path', async () => {
    await ouvrir()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toContain('cut')
  })

  it('the path stays shown for as long as the transition lasts', async () => {
    // Un trajet qui clignote en cours de route serait pire que pas de trajet.
    await ouvrir()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    for (const t of [100, 400, 700, 1000, 1300]) {
      avancer(t === 100 ? 100 : 300)
      expect(trajets(), `à ${t} ms`).toContain('cut')
    }
  })

  it('and the point guard really does travel along that path', async () => {
    // La ligne et le mobile sortent du même calcul ; ce test le vérifie de dehors.
    await ouvrir()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(750)
    expect(trajets()).toContain('cut')
    expect(ordonneeDuMeneur()).toBeLessThan(DEPART)
    expect(ordonneeDuMeneur()).toBeGreaterThan(ARRIVEE)
  })

  it('turning the toggle off mid-playback removes the paths', async () => {
    await ouvrir()
    fireEvent.click(bouton('Trajets'))
    fireEvent.click(bouton('Lecture'))
    avancer(400)
    expect(trajets()).toContain('cut')
    fireEvent.click(bouton('Trajets'))
    expect(trajets()).toEqual([])
  })

  it('stopped on a step, the notebook stays the notebook', async () => {
    // Arrêté sur un temps entier, on relit les flèches dessinées — la bascule ne
    // change rien là, elle ne parle que de ce qui se joue.
    await ouvrir()
    expect(trajets()).toContain('cut')
    fireEvent.click(bouton('Trajets'))
    expect(trajets()).toContain('cut')
  })
})
