import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SchemaList } from './SchemaList'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listPlays, savePlay, saveTeam } from '../../persistence/repositories'
import { nouveauSchema, type Schema } from '../../domain/plays'

const schema = (id: string, nom: string): Schema => ({ id, ...nouveauSchema('ta', 'demi', false), nom })

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.plays.clear()
  await db.teams.clear()
  // Sans équipe en base, `ClubProvider` oublierait le club réglé : la
  // bibliothèque n'aurait alors aucun club dont lister les schémas.
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  localStorage.setItem('swish-club-id', 'ta')
})

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/schemas']}>
      <ClubProvider>
        <AuthProvider>
          <Routes>
            <Route path="/schemas" element={<SchemaList />} />
            {/* L'éditeur est hors sujet ici : un jalon suffit à constater qu'on y va. */}
            <Route path="/schemas/:id/edit" element={<p>éditeur</p>} />
          </Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('SchemaList — la bibliothèque des combinaisons', () => {
  it('liste les schémas du club en vignettes', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Corner pour le 4'))
    // Un schéma d'un autre club n'a rien à faire dans la bibliothèque.
    await savePlay({ ...schema('s3', 'Combinaison de Metz'), clubId: 'tz' })
    renderList()

    const cartes = await screen.findAllByRole('article')
    expect(cartes).toHaveLength(2)
    // Chaque carte porte son nom et sa vignette : c'est à la forme du premier
    // temps que le coach reconnaît sa combinaison.
    const noms = cartes.map((c) => within(c).getByRole('heading').textContent)
    expect(noms).toEqual(expect.arrayContaining(['Pick and roll haut', 'Corner pour le 4']))
    for (const carte of cartes) {
      const nom = within(carte).getByRole('heading').textContent
      expect(within(carte).getByRole('img', { name: `tableau tactique — ${nom}` })).toBeInTheDocument()
    }
    expect(screen.queryByText('Combinaison de Metz')).not.toBeInTheDocument()
  })

  it('créer un schéma est administratif', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: /Nouveau schéma/ }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    // Garder d'abord, écrire ensuite : rien en base, et l'éditeur reste fermé.
    expect(await listPlays('ta')).toHaveLength(0)
    expect(screen.queryByText('éditeur')).not.toBeInTheDocument()
  })

  it('l’administrateur crée un schéma et arrive dans l’éditeur', async () => {
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: /Nouveau schéma/ }))

    expect(await screen.findByText('éditeur')).toBeInTheDocument()
    const crees = await listPlays('ta')
    expect(crees).toHaveLength(1)
    expect(crees[0].temps).toHaveLength(1)
  })

  it('dupliquer ajoute une copie nommée, sans toucher à l’original', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderList()
    await userEvent.click(within((await screen.findAllByRole('article'))[0]).getByRole('button', { name: 'Dupliquer' }))

    await waitFor(async () => expect(await listPlays('ta')).toHaveLength(2))
    const noms = (await listPlays('ta')).map((s) => s.nom).sort()
    expect(noms).toEqual(['Pick and roll haut', 'Pick and roll haut (copie)'])
  })

  it('dupliquer est administratif : la table de marque se voit demander le code admin', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderList()
    await userEvent.click(within((await screen.findAllByRole('article'))[0]).getByRole('button', { name: 'Dupliquer' }))

    expect(await screen.findByRole('heading', { name: /Accès Administrateur requis/ })).toBeInTheDocument()
    expect(await listPlays('ta')).toHaveLength(1)
  })

  it('supprimer un schéma est confirmé puis effectif', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]
    await userEvent.click(within(carte).getByRole('button', { name: 'Supprimer' }))

    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText(/Supprimer le schéma/)).toBeInTheDocument()
    // Tant qu'on n'a pas confirmé, le schéma est toujours là.
    expect(await listPlays('ta')).toHaveLength(1)

    await userEvent.click(within(dialogue).getByRole('button', { name: 'Supprimer' }))
    await waitFor(async () => expect(await listPlays('ta')).toHaveLength(0))
  })
})
