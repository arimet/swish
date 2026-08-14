# La fiche joueur complète — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à voir sur la fiche joueur tout ce que l'application enregistre déjà — passes, rebonds, contres, fautes, répartition des paniers, temps de jeu — et ajouter deux informations signalétiques, la date de naissance et la taille.

**Architecture:** Aucun nouveau parcours du journal d'évènements. Un module de domaine agrège `playerStats(match)` et `playingTimes(match)`, tous deux déjà écrits et testés. Le reste est de l'affichage et un formulaire.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Tailwind v4, Dexie.

## Global Constraints

- Commentaires, libellés et messages de commit **en français accentué** (`é`, `è`, `à`, `ç`). Le dépôt entier est ainsi et le lint l'accepte. Si des accents disparaissent d'un fichier écrit, c'est un bug d'outillage : réécrire le fichier entier avec Write, puis vérifier avec `grep -c 'à\|é' <fichier>`.
- **Une statistique absente s'affiche `—`, jamais `0` ni `0 %`.** Un joueur qui n'a jamais joué n'a pas « 0 passe par match », il n'a pas de moyenne.
- **Les moyennes par match s'affichent avec une décimale** : « 3,4 passes » a un sens que « 3 » n'a pas. Séparateur décimal français, la virgule.
- L'âge n'est **jamais stocké**, toujours calculé depuis la date de naissance.
- Aucune dépendance npm ajoutée.
- Commandes : `pnpm test`, `pnpm lint`, `pnpm build`. Les trois doivent passer avant chaque commit.

## Modèle de données en vigueur

Rappel, il a changé au projet précédent : `MatchMeta { clubId, opponentId, … }`, `Match.roster: string[]`, `playerStats(match)` et `playingTimes(match)` **sans paramètre de côté**.

---

### Task 1 : Les cumuls de carrière et les champs signalétiques

**Files:**
- Create: `src/domain/career.ts`, `src/domain/career.test.ts`
- Modify: `src/domain/types.ts`, `src/dev/seed.ts`

**Interfaces:**
- Consumes: `playerStats(match)` (`src/domain/boxscore.ts`), `playingTimes(match)` (`src/domain/playingtime.ts`).
- Produces: `Player.birthDate?`, `Player.height?`, `interface CareerTotals`, `playerCareer(matches, playerId)`, `ageAt(birthDate, at)`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/domain/career.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { ageAt, playerCareer } from './career'
import type { GameEvent, Match } from './types'

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

/** Rencontre où `roster` joue, avec le chrono lancé puis arrêté à `stop`. */
const mk = (id: string, roster: string[], events: Partial<GameEvent>[], stop = 300): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId: 'ta', opponentId: 'tb' },
  roster, status: 'finished',
  events: [
    { type: 'STARTING_FIVE', team: 'A', playerIds: roster.slice(0, 5) },
    { type: 'CLOCK_START', gameClock: 600 },
    ...events,
    { type: 'CLOCK_STOP', gameClock: stop },
  ].map(ev),
})

describe('ageAt', () => {
  it('donne l’âge révolu', () => {
    expect(ageAt('2000-06-15', new Date('2026-06-15'))).toBe(26)
  })

  it('n’ajoute l’année que le jour de l’anniversaire', () => {
    expect(ageAt('2000-06-15', new Date('2026-06-14'))).toBe(25)
    expect(ageAt('2000-06-15', new Date('2026-06-16'))).toBe(26)
  })

  it('gère un 29 février', () => {
    expect(ageAt('2004-02-29', new Date('2026-03-01'))).toBe(22)
  })
})

describe('playerCareer', () => {
  const m1 = mk('m1', ['p1', 'p2', 'p3', 'p4', 'p5'], [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'reb_def' },
    { type: 'FOUL', team: 'A', target: { kind: 'player', playerId: 'p1' }, foulType: 'personal' },
  ])
  const m2 = mk('m2', ['p1', 'p2', 'p3', 'p4', 'p5'], [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
    { type: 'STAT', team: 'A', playerId: 'p1', stat: 'assist' },
  ])

  it('cumule sur plusieurs rencontres', () => {
    const c = playerCareer([m1, m2], 'p1')
    expect(c.games).toBe(2)
    expect(c.points).toBe(5)
    expect(c.threes).toBe(1)
    expect(c.twoInside).toBe(1)
    expect(c.assists).toBe(2)
    expect(c.defRebounds).toBe(1)
    expect(c.fouls).toBe(1)
    expect(c.misses).toBe(1)
  })

  it('cumule le temps de jeu', () => {
    // 600 → 300 sur chaque rencontre, le joueur étant titulaire tout du long.
    expect(playerCareer([m1, m2], 'p1').seconds).toBe(600)
  })

  it('ignore les rencontres où le joueur n’est pas à l’effectif', () => {
    const autre = mk('m3', ['q1', 'q2', 'q3', 'q4', 'q5'], [])
    expect(playerCareer([m1, autre], 'p1').games).toBe(1)
  })

  it('ne compte aucune rencontre pour un joueur qui n’a jamais joué', () => {
    const c = playerCareer([m1, m2], 'inconnu')
    expect(c.games).toBe(0)
    expect(c.points).toBe(0)
    expect(c.seconds).toBe(0)
  })

  it('ignore les rencontres non commencées', () => {
    const aVenir: Match = { ...mk('m4', ['p1'], []), status: 'setup', events: [] }
    expect(playerCareer([m1, aVenir], 'p1').games).toBe(1)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/domain/career.test.ts`
Expected: FAIL — `Failed to resolve import "./career"`.

- [ ] **Step 3: Ajouter les deux champs signalétiques**

Dans `src/domain/types.ts`, sur l'interface `Player` :

```ts
export interface Player {
  id: string; teamId: string; number: number
  lastName: string; firstName: string; license?: string
  /** Date de naissance au format ISO `AAAA-MM-JJ`. L'âge s'en déduit à l'affichage,
   *  il n'est jamais stocké : un âge en dur devient faux au premier anniversaire. */
  birthDate?: string
  /** Taille en centimètres. */
  height?: number
}
```

- [ ] **Step 4: Écrire le module de carrière**

Créer `src/domain/career.ts` :

```ts
import { playerStats } from './boxscore'
import { playingTimes } from './playingtime'
import type { Match } from './types'

export interface CareerTotals {
  games: number
  points: number
  fieldGoalsMade: number; misses: number
  threes: number; twoInside: number; twoOutside: number; freeThrows: number
  assists: number; offRebounds: number; defRebounds: number; blocks: number
  fouls: number
  /** Temps de jeu cumulé, en secondes. */
  seconds: number
}

const ZERO: CareerTotals = {
  games: 0, points: 0, fieldGoalsMade: 0, misses: 0,
  threes: 0, twoInside: 0, twoOutside: 0, freeThrows: 0,
  assists: 0, offRebounds: 0, defRebounds: 0, blocks: 0, fouls: 0, seconds: 0,
}

/**
 * Cumuls d'un joueur sur les rencontres où il figure à l'effectif et qui ont commencé.
 * Une rencontre planifiée mais non jouée ne compte pas : elle ferait baisser toutes
 * les moyennes sans qu'aucune action n'ait eu lieu.
 */
export function playerCareer(matches: Match[], playerId: string): CareerTotals {
  const t: CareerTotals = { ...ZERO }
  for (const m of matches) {
    if (m.status === 'setup' || !m.roster.includes(playerId)) continue
    const s = playerStats(m).find((x) => x.playerId === playerId)
    if (!s) continue
    t.games++
    t.points += s.points
    t.fieldGoalsMade += s.fieldGoalsMade; t.misses += s.misses
    t.threes += s.threes; t.twoInside += s.twoInside; t.twoOutside += s.twoOutside
    t.freeThrows += s.freeThrows
    t.assists += s.assists; t.offRebounds += s.offRebounds; t.defRebounds += s.defRebounds
    t.blocks += s.blocks; t.fouls += s.fouls
    t.seconds += playingTimes(m).get(playerId) ?? 0
  }
  return t
}

/**
 * Âge révolu à la date donnée. La date de référence est un paramètre plutôt que
 * l'horloge du moment : sans cela, tout test dépendrait du jour où il tourne.
 */
export function ageAt(birthDate: string, at: Date): number {
  const b = new Date(`${birthDate}T00:00:00`)
  let age = at.getFullYear() - b.getFullYear()
  const moisEcoule = at.getMonth() - b.getMonth()
  if (moisEcoule < 0 || (moisEcoule === 0 && at.getDate() < b.getDate())) age--
  return age
}
```

- [ ] **Step 5: Donner des dates de naissance et des tailles à la démonstration**

Dans `src/dev/seed.ts`, la fabrique de joueurs reçoit deux champs supplémentaires.

Choisis des valeurs plausibles pour une équipe senior : des naissances réparties entre le
début des années 1990 et le début des années 2000, et des tailles croissant globalement
avec le numéro — les meneurs portent les petits numéros et mesurent moins que les
intérieurs. Ne rends pas toutes les valeurs identiques : la fiche doit montrer des écarts.

Laisse **au moins un joueur sans date de naissance ni taille** : c'est le cas qu'il faut
pouvoir regarder à l'écran pour vérifier que la fiche ne montre pas de bloc vide.

Passe `SEED_VERSION` à la valeur suivante, sinon les navigateurs déjà pourvus ne
régénéreront rien et la fonctionnalité paraîtra absente. Vérifie la valeur actuelle dans le
fichier plutôt que de la supposer.

- [ ] **Step 6: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(domain): cumuls de carrière, date de naissance et taille"
```

---

### Task 2 : Saisir et corriger la fiche signalétique

**Files:**
- Modify: `src/ui/screens/TeamDetail.tsx`
- Test: `src/ui/screens/TeamDetail.test.tsx` (créé s'il n'existe pas)

**Interfaces:**
- Consumes: `Player.birthDate`, `Player.height` (Task 1), `savePlayer` (`src/persistence/repositories.ts`).
- Produces: un effectif dont chaque joueur peut recevoir et corriger sa date de naissance et sa taille.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer ou compléter `src/ui/screens/TeamDetail.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDetail } from './TeamDetail'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { listPlayers, savePlayer, saveTeam } from '../../persistence/repositories'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1')
  await db.teams.clear(); await db.players.clear(); await db.matches.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
})

const renderTeam = () =>
  render(
    <MemoryRouter initialEntries={['/teams/ta']}>
      <AdminProvider>
        <Routes><Route path="/teams/:id" element={<TeamDetail />} /></Routes>
      </AdminProvider>
    </MemoryRouter>,
  )

describe('TeamDetail — fiche signalétique', () => {
  it('renseigne la date de naissance sans changer l’identifiant du joueur', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '2000-06-15')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    await waitFor(async () => {
      const [p] = await listPlayers('ta')
      // L'identifiant doit survivre : il porte tout l'historique de tirs du joueur.
      expect(p.id).toBe('p1')
      expect(p.birthDate).toBe('2000-06-15')
    })
  })

  it('renseigne la taille', async () => {
    renderTeam()
    await userEvent.click(await screen.findByRole('button', { name: /modifier MARTIN/i }))
    await userEvent.type(screen.getByLabelText(/taille/i), '192')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(async () => expect((await listPlayers('ta'))[0].height).toBe(192))
  })

  it('ajoute un joueur avec sa date de naissance et sa taille', async () => {
    renderTeam()
    await userEvent.type(screen.getByPlaceholderText('N°'), '9')
    await userEvent.type(screen.getByPlaceholderText('Nom'), 'DUPONT')
    await userEvent.type(screen.getByLabelText(/date de naissance/i), '1998-03-02')
    await userEvent.type(screen.getByLabelText(/taille/i), '201')
    await userEvent.click(screen.getByRole('button', { name: /ajouter le joueur/i }))

    await waitFor(async () => {
      const ajoute = (await listPlayers('ta')).find((p) => p.lastName === 'DUPONT')
      expect(ajoute?.birthDate).toBe('1998-03-02')
      expect(ajoute?.height).toBe(201)
    })
  })
})
```

> Les libellés attendus par ces tests (`modifier MARTIN`, `date de naissance`, `taille`, `enregistrer`, `ajouter le joueur`) sont ceux que tu dois poser dans l'interface. Si tu en choisis d'autres, ajuste les tests en conséquence — mais ils doivent rester accessibles par leur nom, pas par un identifiant de test.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/ui/screens/TeamDetail.test.tsx`
Expected: FAIL — ni bouton de modification, ni champs de date ou de taille.

- [ ] **Step 3: Étendre le formulaire d'ajout**

Dans `src/ui/screens/TeamDetail.tsx`, le formulaire d'ajout gagne deux champs optionnels :
une date de naissance (`<input type="date">`, qui donne directement le format ISO attendu)
et une taille en centimètres (`<input type="number" inputMode="numeric">`).

Chaque champ porte un `<label>` explicite associé — pas seulement un `placeholder`, qui
disparaît à la saisie et n'est pas un nom accessible fiable.

À l'ajout, ne stocke que ce qui est renseigné : une chaîne vide devient `undefined`, pas
une chaîne vide ni un `NaN`.

- [ ] **Step 4: Permettre la correction d'un joueur existant**

Chaque ligne de l'effectif gagne un bouton « Modifier » qui déplie deux champs — date de
naissance et taille — pré-remplis, plus un bouton « Enregistrer ».

L'enregistrement passe par `savePlayer({ ...joueur, birthDate, height })` : **le joueur
conserve son identifiant**. C'est le point qui compte : cet identifiant porte tout son
historique de tirs et de statistiques, et le recréer le lui ferait perdre.

Le bouton « retirer » existant reste **en dehors** de la zone dépliée et ne change pas de
comportement.

Comme le reste de l'écran, ces actions passent par `guard` de `useAdmin` : la modification
d'un effectif est réservée à l'administrateur.

- [ ] **Step 5: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(effectif): date de naissance et taille, saisie et correction en place"
```

---

### Task 3 : La fiche joueur complète

**Files:**
- Modify: `src/ui/screens/PlayerDetail.tsx`
- Test: `src/ui/screens/PlayerDetail.test.tsx`

**Interfaces:**
- Consumes: `playerCareer`, `ageAt`, `CareerTotals` (Task 1) ; `playerStats(match)`, `playingTimes(match)` ; `fmt` (`src/ui/components/GameClock.tsx`) pour formater une durée.
- Produces: rien de nouveau.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `src/ui/screens/PlayerDetail.test.tsx` :

```tsx
it('affiche l’âge et la taille quand ils sont renseignés', async () => {
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas', birthDate: '2000-06-15', height: 192 })
  renderAt('p1')
  expect(await screen.findByText(/192 cm/)).toBeInTheDocument()
  expect(screen.getByText(/ans/)).toBeInTheDocument()
})

it('n’affiche aucun bloc signalétique quand rien n’est renseigné', async () => {
  renderAt('p1')
  expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
  expect(screen.queryByText(/cm/)).not.toBeInTheDocument()
  expect(screen.queryByText(/ans/)).not.toBeInTheDocument()
})

it('affiche les statistiques secondaires en moyenne par match', async () => {
  renderAt('p1')
  // Une passe décisive sur une rencontre → 1,0 par match, jamais « 1 ».
  expect(await screen.findByText('1,0')).toBeInTheDocument()
})

it('affiche un tiret plutôt qu’un zéro pour un joueur sans rencontre', async () => {
  await db.matches.clear()
  renderAt('p1')
  expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
  expect(screen.queryByText('0,0')).not.toBeInTheDocument()
})
```

> Le `beforeEach` existant du fichier crée un joueur `p1` sans date de naissance ni taille,
> et une rencontre. Complète-le si besoin d'une passe décisive pour le troisième cas —
> **sans casser les cas déjà présents**, qui portent sur les pourcentages de réussite.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/ui/screens/PlayerDetail.test.tsx`
Expected: FAIL — ni âge, ni taille, ni moyennes secondaires.

- [ ] **Step 3: Enrichir l'en-tête et les cartes**

Dans `src/ui/screens/PlayerDetail.tsx` :

- l'en-tête affiche l'âge (`ageAt(player.birthDate, new Date())`, suivi de « ans ») et la
  taille (`… cm`) **seulement si le champ correspondant est renseigné** ;
- les cartes de synthèse gagnent le **temps de jeu moyen**, formaté en minutes et secondes
  avec `fmt` de `GameClock` ;
- un panneau « Statistiques » présente, en cumul **et** en moyenne par match : passes
  décisives, rebonds offensifs, rebonds défensifs, contres, fautes, puis la répartition des
  paniers — 2 pts intérieurs, 2 pts extérieurs, 3 pts, lancers francs.

Les moyennes s'écrivent avec une décimale et une virgule décimale. Écris un petit
formateur local plutôt que de répéter le calcul :

```tsx
/** Moyenne par rencontre, à une décimale. `—` quand aucune rencontre n'a été jouée :
 *  un joueur qui n'a pas joué n'a pas « 0,0 passe », il n'a pas de moyenne. */
const parMatch = (total: number, games: number) =>
  games ? (total / games).toFixed(1).replace('.', ',') : '—'
```

- [ ] **Step 4: Compléter la ligne par rencontre**

Dans l'historique, la zone dépliée d'une rencontre affiche aujourd'hui trois nombres. Elle
doit montrer la ligne complète du joueur ce jour-là : points, tirs réussis et manqués,
passes, rebonds, contres, fautes, et son temps de jeu — `playingTimes(m).get(id)`, formaté
avec `fmt`.

Garde la hot zone du match à côté : c'est ce que le lecteur vient chercher en dépliant.

- [ ] **Step 5: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`

- [ ] **Step 6: Vérifier le rendu réel**

Démarrer l'aperçu (jamais via Bash), ouvrir la fiche d'un joueur du seed et contrôler :
l'âge et la taille s'affichent, les moyennes ont une décimale, le joueur laissé sans
signalétique n'affiche **aucun bloc vide**, et la ligne par rencontre est lisible à côté de
la carte.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(joueur): fiche complète — signalétique, statistiques et ligne par rencontre"
```

---

## Auto-relecture

**Couverture du spec**

| Section du spec | Tâche |
|---|---|
| §1 Champs signalétiques | Task 1 (modèle) et Task 2 (saisie) |
| §2 Cumuls de carrière | Task 1 |
| §3 Fiche joueur | Task 3 |
| §4 Données de démonstration | Task 1, step 5 |

**Point d'attention pour l'exécutant** — la règle « une statistique absente s'affiche `—` » se
heurte à la tentation d'écrire `total / games || 0`. Un joueur sans rencontre n'a pas une
moyenne nulle, il n'a pas de moyenne ; les deux se lisent différemment sur une fiche.
