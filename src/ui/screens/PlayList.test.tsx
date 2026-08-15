import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayList } from './PlayList'
import { AuthProvider, ROLE_KEY } from '../../app/auth'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { listPlays, savePlay, saveTeam } from '../../persistence/repositories'
import { newPlay, type Play } from '../../domain/plays'

const play = (id: string, name: string, extra: Partial<Play> = {}): Play =>
  ({ id, ...newPlay('ta', 'half', false), name, ...extra })

beforeEach(async () => {
  sessionStorage.setItem(ROLE_KEY, 'admin')
  localStorage.clear()
  await db.plays.clear()
  await db.teams.clear()
  // With no team in the store, `ClubProvider` would forget the club set: the library
  // would then have no club whose plays to list.
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  localStorage.setItem('swish-club-id', 'ta')
})

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/schemas']}>
      <ClubProvider>
        <AuthProvider>
          <Routes>
            <Route path="/schemas" element={<PlayList />} />
            {/* The editor is beside the point here: a marker is enough to see that we
                get there. */}
            <Route path="/schemas/:id/edit" element={<p>éditeur</p>} />
          </Routes>
        </AuthProvider>
      </ClubProvider>
    </MemoryRouter>,
  )

describe('SchemaList — the playbook', () => {
  it('lists the club\'s plays as thumbnails', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    await savePlay(play('s2', 'Corner pour le 4'))
    // Another club's play has no business in the library.
    await savePlay({ ...play('s3', 'Combinaison de Metz'), clubId: 'tz' })
    renderList()

    const cartes = await screen.findAllByRole('article')
    expect(cartes).toHaveLength(2)
    // Each card carries its name and its thumbnail: it is by the first step's shape
    // that the coach recognises their play.
    const noms = cartes.map((c) => within(c).getByRole('heading').textContent)
    expect(noms).toEqual(expect.arrayContaining(['Pick and roll haut', 'Corner pour le 4']))
    for (const carte of cartes) {
      const name = within(carte).getByRole('heading').textContent
      expect(within(carte).getByRole('img', { name: `tableau tactique — ${name}` })).toBeInTheDocument()
    }
    expect(screen.queryByText('Combinaison de Metz')).not.toBeInTheDocument()
  })

  it('creating a play is administrative: the scorer\'s table sees no create button', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    renderList()
    await screen.findByText(/la bibliothèque est vide/i)

    // Neither in the action bar nor in the empty state, which tells it instead what it
    // is waiting for — rather than inviting it to draw what it has no right to write.
    expect(screen.queryByRole('button', { name: /Nouveau schéma/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dessiner ma première combinaison/i })).not.toBeInTheDocument()
    expect(screen.getByText(/apparaîtront ici/i)).toBeInTheDocument()
    // What matters: nothing in the store, and the editor stays shut.
    expect(await listPlays('ta')).toHaveLength(0)
    expect(screen.queryByText('éditeur')).not.toBeInTheDocument()
  })

  it('the administrator creates a play and lands in the editor', async () => {
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: /Nouveau schéma/ }))

    expect(await screen.findByText('éditeur')).toBeInTheDocument()
    const crees = await listPlays('ta')
    expect(crees).toHaveLength(1)
    expect(crees[0].steps).toHaveLength(1)
  })

  it('duplicating adds a named copy, without touching the original', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    renderList()
    await userEvent.click(within((await screen.findAllByRole('article'))[0]).getByRole('button', { name: 'Dupliquer' }))

    await waitFor(async () => expect(await listPlays('ta')).toHaveLength(2))
    const noms = (await listPlays('ta')).map((s) => s.name).sort()
    expect(noms).toEqual(['Pick and roll haut', 'Pick and roll haut (copie)'])
  })

  it('duplicating and deleting are administrative: the scorer\'s table only gets "Play", and nothing is written', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await savePlay(play('s1', 'Pick and roll haut'))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]

    expect(within(carte).queryByRole('button', { name: 'Dupliquer' })).not.toBeInTheDocument()
    expect(within(carte).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
    // Play stays: it is what people come to the sideline for.
    expect(within(carte).getByRole('link', { name: /jouer/i })).toBeInTheDocument()
    // What matters: the library has not moved.
    expect(await listPlays('ta')).toHaveLength(1)
  })

  it('deleting a play is confirmed and then takes effect', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]
    await userEvent.click(within(carte).getByRole('button', { name: 'Supprimer' }))

    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText(/Supprimer le schéma/)).toBeInTheDocument()
    // Until it is confirmed, the play is still there.
    expect(await listPlays('ta')).toHaveLength(1)

    await userEvent.click(within(dialogue).getByRole('button', { name: 'Supprimer' }))
    await waitFor(async () => expect(await listPlays('ta')).toHaveLength(0))
  })
})

describe('SchemaList — filing the library', () => {
  it('derives the folder bar from the plays, "Unfiled" last', async () => {
    await savePlay(play('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(play('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    await savePlay(play('s3', 'Brouillon'))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    expect(within(barre).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Tous', 'Attaque placée', 'Remises en jeu', 'Sans dossier'])
  })

  it('offers "Unfiled" only while unfiled plays remain', async () => {
    await savePlay(play('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    expect(within(barre).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tous', 'Attaque placée'])
  })

  it('choosing a folder leaves only its plays in the grid', async () => {
    await savePlay(play('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(play('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    await savePlay(play('s3', 'Brouillon'))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    await userEvent.click(within(barre).getByRole('button', { name: 'Remises en jeu' }))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Remise ligne de fond'])

    // "Unfiled" shows only the unfiled plays, never the others.
    await userEvent.click(within(barre).getByRole('button', { name: 'Sans dossier' }))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Brouillon'])

    await userEvent.click(within(barre).getByRole('button', { name: 'Tous' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('the search filters on the name', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    await savePlay(play('s2', 'Remise ligne de fond'))
    renderList()

    await userEvent.type(await screen.findByRole('searchbox'), 'PICK')
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Pick and roll haut'])
  })

  it('the search also filters on the note, ignoring accents', async () => {
    // The word searched for is in no name: only the note can return it.
    await savePlay(play('s1', 'Pick and roll haut', { note: 'Sortie contre une défense en zone' }))
    await savePlay(play('s2', 'Remise ligne de fond', { note: 'Sur panier encaissé' }))
    renderList()

    await userEvent.type(await screen.findByRole('searchbox'), 'defense')
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Pick and roll haut'])
  })

  it('orders from most recently edited to oldest, plays never stamped last', async () => {
    // A direct write: `savePlay` stamps the current time, and we could not otherwise
    // build three distinct dates nor a play from before the timestamping.
    await db.plays.put(play('s1', 'Ancien', { updatedAt: '2026-01-01T10:00:00.000Z' }))
    await db.plays.put(play('s2', 'Récent', { updatedAt: '2026-06-01T10:00:00.000Z' }))
    await db.plays.put(play('s3', 'Jamais horodaté'))
    renderList()

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Récent', 'Ancien', 'Jamais horodaté'])
  })

  it('the administrator files a play into a folder, which appears in the bar', async () => {
    await savePlay(play('s1', 'Pick and roll haut'))
    renderList()

    await userEvent.click(await screen.findByRole('button', { name: 'Dossier de « Pick and roll haut »' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Dossier' }), 'Attaque placée')
    await userEvent.click(screen.getByRole('button', { name: 'Ranger' }))

    await waitFor(async () => expect((await listPlays('ta'))[0].folder).toBe('Attaque placée'))
    expect(within(await screen.findByRole('group', { name: 'Dossiers' })).getByRole('button', { name: 'Attaque placée' }))
      .toBeInTheDocument()
  })

  it('changing the folder is administrative: the scorer\'s table reads it without being able to change it', async () => {
    sessionStorage.setItem(ROLE_KEY, 'scorer')
    await savePlay(play('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]

    // The filing stays readable — it is a classification, not an action — but there is
    // no longer a button to press only to be asked for a code.
    expect(within(carte).getByText('Attaque placée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dossier de « Pick and roll haut »' })).not.toBeInTheDocument()
    // Ni saisie ouverte, ni écriture en base.
    expect(screen.queryByRole('combobox', { name: 'Dossier' })).not.toBeInTheDocument()
    expect((await listPlays('ta'))[0].folder).toBe('Attaque placée')
  })

  it('a visitor searches and filters without being asked for any code', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await savePlay(play('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(play('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    await userEvent.click(within(barre).getByRole('button', { name: 'Remises en jeu' }))
    await userEvent.type(screen.getByRole('searchbox'), 'remise')

    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Remise ligne de fond'])
    expect(screen.queryByRole('heading', { name: /Accès/ })).not.toBeInTheDocument()
  })
})
