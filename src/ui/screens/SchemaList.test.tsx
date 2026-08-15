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
import { newPlay, type Play } from '../../domain/plays'

const schema = (id: string, nom: string, extra: Partial<Play> = {}): Play =>
  ({ id, ...newPlay('ta', 'half', false), nom, ...extra })

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

  it('créer un schéma est administratif : la table de marque ne voit aucun bouton de création', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    renderList()
    await screen.findByText(/la bibliothèque est vide/i)

    // Ni dans la barre d'action, ni dans l'état vide, qui lui dit plutôt ce qu'il
    // attend — au lieu de l'inviter à dessiner ce qu'elle n'a pas le droit d'écrire.
    expect(screen.queryByRole('button', { name: /Nouveau schéma/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dessiner ma première combinaison/i })).not.toBeInTheDocument()
    expect(screen.getByText(/apparaîtront ici/i)).toBeInTheDocument()
    // Ce qui compte : rien en base, et l'éditeur reste fermé.
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

  it('dupliquer et supprimer sont administratifs : la table de marque n’a que « Jouer », et rien n’est écrit', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]

    expect(within(carte).queryByRole('button', { name: 'Dupliquer' })).not.toBeInTheDocument()
    expect(within(carte).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
    // Jouer reste, c'est ce qu'on vient chercher au bord du terrain.
    expect(within(carte).getByRole('link', { name: /jouer/i })).toBeInTheDocument()
    // Ce qui compte : la bibliothèque n'a pas bougé.
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

describe('SchemaList — le rangement de la bibliothèque', () => {
  it('déduit la barre de dossiers des schémas, « Sans dossier » en dernier', async () => {
    await savePlay(schema('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(schema('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    await savePlay(schema('s3', 'Brouillon'))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    expect(within(barre).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Tous', 'Attaque placée', 'Remises en jeu', 'Sans dossier'])
  })

  it('n’offre « Sans dossier » que s’il reste des schémas non rangés', async () => {
    await savePlay(schema('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    expect(within(barre).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tous', 'Attaque placée'])
  })

  it('choisir un dossier ne laisse que ses schémas dans la grille', async () => {
    await savePlay(schema('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(schema('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    await savePlay(schema('s3', 'Brouillon'))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    await userEvent.click(within(barre).getByRole('button', { name: 'Remises en jeu' }))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Remise ligne de fond'])

    // « Sans dossier » ne montre que les schémas non rangés, jamais les autres.
    await userEvent.click(within(barre).getByRole('button', { name: 'Sans dossier' }))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Brouillon'])

    await userEvent.click(within(barre).getByRole('button', { name: 'Tous' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('la recherche filtre sur le nom', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    await savePlay(schema('s2', 'Remise ligne de fond'))
    renderList()

    await userEvent.type(await screen.findByRole('searchbox'), 'PICK')
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Pick and roll haut'])
  })

  it('la recherche filtre aussi sur la note, sans se soucier des accents', async () => {
    // Le mot cherché n'est dans aucun nom : seule la note peut le rendre.
    await savePlay(schema('s1', 'Pick and roll haut', { note: 'Sortie contre une défense en zone' }))
    await savePlay(schema('s2', 'Remise ligne de fond', { note: 'Sur panier encaissé' }))
    renderList()

    await userEvent.type(await screen.findByRole('searchbox'), 'defense')
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Pick and roll haut'])
  })

  it('range du plus récemment modifié au plus ancien, les schémas jamais horodatés en dernier', async () => {
    // Écriture directe : `savePlay` horodate à l'instant, on ne pourrait pas
    // fabriquer trois dates distinctes ni un schéma d'avant l'horodatage.
    await db.plays.put(schema('s1', 'Ancien', { updatedAt: '2026-01-01T10:00:00.000Z' }))
    await db.plays.put(schema('s2', 'Récent', { updatedAt: '2026-06-01T10:00:00.000Z' }))
    await db.plays.put(schema('s3', 'Jamais horodaté'))
    renderList()

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Récent', 'Ancien', 'Jamais horodaté'])
  })

  it('l’administrateur range un schéma dans un dossier, qui apparaît dans la barre', async () => {
    await savePlay(schema('s1', 'Pick and roll haut'))
    renderList()

    await userEvent.click(await screen.findByRole('button', { name: 'Dossier de « Pick and roll haut »' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Dossier' }), 'Attaque placée')
    await userEvent.click(screen.getByRole('button', { name: 'Ranger' }))

    await waitFor(async () => expect((await listPlays('ta'))[0].folder).toBe('Attaque placée'))
    expect(within(await screen.findByRole('group', { name: 'Dossiers' })).getByRole('button', { name: 'Attaque placée' }))
      .toBeInTheDocument()
  })

  it('changer le dossier est administratif : la table de marque le lit sans pouvoir le changer', async () => {
    sessionStorage.setItem(ROLE_KEY, 'marque')
    await savePlay(schema('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    renderList()
    const carte = (await screen.findAllByRole('article'))[0]

    // Le rangement reste lisible — c'est un classement, pas une action — mais il
    // n'y a plus de bouton à presser pour se voir réclamer un code.
    expect(within(carte).getByText('Attaque placée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dossier de « Pick and roll haut »' })).not.toBeInTheDocument()
    // Ni saisie ouverte, ni écriture en base.
    expect(screen.queryByRole('combobox', { name: 'Dossier' })).not.toBeInTheDocument()
    expect((await listPlays('ta'))[0].folder).toBe('Attaque placée')
  })

  it('un visiteur cherche et filtre sans qu’aucun code lui soit demandé', async () => {
    sessionStorage.removeItem(ROLE_KEY)
    await savePlay(schema('s1', 'Pick and roll haut', { folder: 'Attaque placée' }))
    await savePlay(schema('s2', 'Remise ligne de fond', { folder: 'Remises en jeu' }))
    renderList()

    const barre = await screen.findByRole('group', { name: 'Dossiers' })
    await userEvent.click(within(barre).getByRole('button', { name: 'Remises en jeu' }))
    await userEvent.type(screen.getByRole('searchbox'), 'remise')

    expect(screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent))
      .toEqual(['Remise ligne de fond'])
    expect(screen.queryByRole('heading', { name: /Accès/ })).not.toBeInTheDocument()
  })
})
