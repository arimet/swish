import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SchemaRecu } from './SchemaRecu'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listPlays, savePlay, saveTeam } from '../../persistence/repositories'
import { encoder } from '../../domain/partage'
import { newPlay, nextStep, type Play } from '../../domain/plays'

/** Deux temps : le meneur descend de 0,62 à 0,20. Le même schéma que le lecteur
 *  de 8B, pour que le défilement se prouve sur un pion qui bouge vraiment. */
const deuxTemps = (): Play => {
  const s: Play = { id: 's1', ...newPlay('ta', 'half', false), name: 'Corner pour le 4', note: 'Sortie de balle' }
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

/** L'ordonnée du meneur telle que le tableau la dessine : la seule preuve que le
 *  défilement montre bien un autre temps, plutôt qu'un compteur d'écran. */
function ordonneeDuMeneur(): number {
  const groupe = [...document.querySelectorAll('g[data-marker="offense"]')]
    .find((n) => n.querySelector('text')?.textContent === '1')
  return Number(groupe!.querySelector('circle')!.getAttribute('cy'))
}

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.plays.clear()
  await db.teams.clear()
  // Sans équipe en base, `ClubProvider` oublierait le club réglé.
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  localStorage.setItem('swish-club-id', 'ta')
})

/** Ouvre l'écran de réception sur le fragment donné. `useLocation().hash` rend le
 *  `#` avec le code : `MemoryRouter` le transporte tel quel. */
const ouvrir = (code: string) =>
  render(
    <MemoryRouter initialEntries={[`/schemas/recu#${code}`]}>
      <ClubProvider>
        <AuthProvider>
          <Routes>
            <Route path="/schemas/recu" element={<SchemaRecu />} />
            {/* La fiche est hors sujet ici : un jalon suffit à constater qu'on y va. */}
            <Route path="/schemas/:id" element={<p>fiche</p>} />
            <Route path="/" element={<p>bienvenue</p>} />
          </Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('SchemaRecu — the play that arrived by link', () => {
  it('shows the play the link carries, name and board', async () => {
    ouvrir(await encoder(deuxTemps()))

    expect(await screen.findByRole('img', { name: 'tableau tactique — Corner pour le 4' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Corner pour le 4' })).toBeInTheDocument()
    expect(screen.getByText('Sortie de balle')).toBeInTheDocument()
  })

  it('can be stepped through: the steps advance', async () => {
    ouvrir(await encoder(deuxTemps()))
    await screen.findByRole('img', { name: /tableau tactique/ })

    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
    expect(screen.getByText('Temps 1 / 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Temps suivant' }))
    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
    expect(screen.getByText('Temps 2 / 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Temps précédent' }))
    expect(ordonneeDuMeneur()).toBeCloseTo(DEPART, 6)
  })

  it('on a damaged link, says so plainly rather than rendering a blank page', async () => {
    ouvrir('ce-lien-a-ete-tronque-par-la-messagerie')

    expect(await screen.findByText(/Ce lien est incomplet ou abîmé/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /tableau tactique/ })).not.toBeInTheDocument()
    // Un écran sans issue est un piège : on doit pouvoir rejoindre l'application.
    expect(screen.getByRole('link', { name: /Swish/ })).toBeInTheDocument()
  })

  it('"Add to my library" creates a fresh play, without touching the original', async () => {
    // L'expéditeur et le destinataire partagent la même base : c'est le cas où
    // un import mal fait écraserait le schéma d'origine.
    const original = deuxTemps()
    await savePlay(original)
    ouvrir(await encoder(original))
    await screen.findByRole('img', { name: /tableau tactique/ })

    await userEvent.click(screen.getByRole('button', { name: /Ajouter à ma bibliothèque/ }))

    await waitFor(async () => expect(await listPlays('ta')).toHaveLength(2))
    const schemas = await listPlays('ta')
    const ajoute = schemas.find((s) => s.id !== 's1')!
    expect(ajoute.id).not.toBe('')
    expect(ajoute.clubId).toBe('ta')
    expect(ajoute.name).toBe('Corner pour le 4')
    expect(ajoute.steps).toEqual(original.steps)
    // L'original est intact, et c'est la fiche du schéma créé qu'on ouvre.
    expect(schemas.find((s) => s.id === 's1')!.name).toBe('Corner pour le 4')
    expect(await screen.findByText('fiche')).toBeInTheDocument()
  })

  it('adding is administrative: the scorer\'s table is asked for the code, and nothing is written', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    ouvrir(await encoder(deuxTemps()))
    await screen.findByRole('img', { name: /tableau tactique/ })

    await userEvent.click(screen.getByRole('button', { name: /Ajouter à ma bibliothèque/ }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(await listPlays('ta')).toHaveLength(0)
    expect(screen.queryByText('fiche')).not.toBeInTheDocument()
  })

  it('reading a received play asks for no code, even with no role at all', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    ouvrir(await encoder(deuxTemps()))
    await screen.findByRole('img', { name: /tableau tactique/ })

    await userEvent.click(screen.getByRole('button', { name: 'Temps suivant' }))

    expect(ordonneeDuMeneur()).toBeCloseTo(ARRIVEE, 6)
    expect(screen.queryByRole('heading', { name: /Accès .* requis/ })).not.toBeInTheDocument()
  })

  it('with no club set, leads to the club choice instead of a button that would fail', async () => {
    // Celui qui reçoit le lien n'a peut-être jamais ouvert l'application : le
    // schéma s'affiche quand même, seul l'ajout attend qu'un club soit choisi.
    localStorage.clear()
    ouvrir(await encoder(deuxTemps()))

    expect(await screen.findByRole('img', { name: /tableau tactique/ })).toBeInTheDocument()
    const lien = await screen.findByRole('link', { name: /Choisir un club/ })
    expect(screen.queryByRole('button', { name: /Ajouter à ma bibliothèque/ })).not.toBeInTheDocument()

    await userEvent.click(lien)
    expect(await screen.findByText('bienvenue')).toBeInTheDocument()
  })
})
