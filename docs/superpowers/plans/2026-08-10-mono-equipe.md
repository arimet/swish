# L'application devient mono-équipe — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de `swish` le hub d'une seule équipe : supprimer le mode deux équipes, aligner le modèle de données sur cette réalité, et retravailler les données de démonstration en conséquence.

**Architecture:** Projet de **suppression**. L'ordre des tâches est délibéré : on retire d'abord les écrans et les chemins morts, ce qui réduit la surface que le renommage du modèle devra traverser en tâche 3. Chaque tâche laisse la suite verte et l'application utilisable.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Tailwind v4, react-router-dom v7, Dexie.

## Global Constraints

- Commentaires, libellés et messages de commit **en français accentué** (`é`, `è`, `à`, `ç`). Le dépôt entier est ainsi et le lint l'accepte. Si des accents disparaissent d'un fichier écrit, c'est un bug d'outillage : réécrire le fichier entier avec Write, puis vérifier avec `grep -c 'à\|é' <fichier>`.
- **Les évènements gardent `team: 'A' | 'B'`.** `A` désigne notre club, `B` l'adversaire. L'adversaire marque des points sans avoir d'effectif : cette asymétrie est réelle et ne doit pas être supprimée.
- Une statistique absente s'affiche `—`, jamais `0` ni `0 %`.
- Aucune dépendance npm ajoutée.
- Commandes : `pnpm test`, `pnpm lint`, `pnpm build`. Les trois doivent passer avant chaque commit.
- **Aucune tâche ne laisse l'application cassée.** Si une tâche exige de toucher vingt fichiers pour rester verte, elle les touche.

---

## Ordre et raison d'être des tâches

| # | Tâche | Pourquoi à ce rang |
|---|---|---|
| 1 | Supprimer les écrans à deux équipes | Retire le plus gros volume ; le modèle n'a pas encore bougé, donc les suppressions sont sans risque |
| 2 | Supprimer les chemins morts des écrans conservés | Les conditions `meta.solo` deviennent inconditionnelles ; prépare la suppression du drapeau |
| 3 | Aligner le modèle de données | Le renommage ne traverse plus que les fichiers réellement vivants |
| 4 | Navigation et données de démonstration | S'appuie sur le modèle final |

---

### Task 1 : Supprimer les écrans à deux équipes

**Files:**
- Delete: `src/ui/screens/LiveMatch.tsx`, `src/ui/screens/LiveRouter.tsx`, `src/ui/screens/LiveRouter.test.tsx`, `src/ui/screens/Home.tsx`, `src/ui/screens/Classement.tsx`, `src/domain/standings.ts`, `src/domain/standings.test.ts`
- Rename: `src/ui/screens/SoloLiveMatch.tsx` → `src/ui/screens/LiveMatch.tsx`, `src/ui/screens/SoloLiveMatch.test.tsx` → `src/ui/screens/LiveMatch.test.tsx`
- Modify: `src/App.tsx`, `src/ui/components/StartingFiveGate.tsx`, `src/ui/components/StartingFiveGate.test.tsx`, `src/ui/olive/OliveShell.tsx`, `src/ui/screens/Dashboard.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `LiveMatch` (l'ancien `SoloLiveMatch`) comme unique table de marque, monté directement sur `/match/:id/live`.

- [ ] **Step 1: Supprimer, renommer, et rebrancher la route**

```bash
git rm src/ui/screens/LiveRouter.tsx src/ui/screens/LiveRouter.test.tsx
git rm src/ui/screens/Home.tsx src/ui/screens/Classement.tsx
git rm src/domain/standings.ts src/domain/standings.test.ts
git rm src/ui/screens/LiveMatch.tsx src/ui/screens/LiveMatch.test.tsx
git mv src/ui/screens/SoloLiveMatch.tsx src/ui/screens/LiveMatch.tsx
git mv src/ui/screens/SoloLiveMatch.test.tsx src/ui/screens/LiveMatch.test.tsx
```

Dans le fichier renommé, remplacer le nom du composant `SoloLiveMatch` par `LiveMatch` (déclaration, export, et toute mention dans son commentaire de tête). Faire de même dans son fichier de test, y compris l'import.

Dans `src/App.tsx` : supprimer les imports de `Home`, `Classement`, `LiveRouter` ; importer `LiveMatch` ; faire pointer `LiveRoute` sur `LiveMatch` ; supprimer les routes `/rencontres` et `/classement`.

- [ ] **Step 2: Réduire `StartingFiveGate` à une seule colonne**

Le composant garde `rosterA`, `requiredA`, `selected`, `onToggle`, `onStart`, `canStart`, `onExit`. Supprimer `rosterB`, `requiredB`, `solo`, le second `StartingFivePanel`, la classe de grille conditionnelle et le texte d'aide conditionnel.

Le titre du panneau devient « MON ÉQUIPE ». La constante `TEAM_B` devient inutilisée : la supprimer.

Adapter `StartingFiveGate.test.tsx` : le test de non-régression « affiche les deux panneaux sans la prop `solo` » n'a plus d'objet, la variante à deux colonnes n'existant plus. Le remplacer par un test qui vérifie qu'un seul panneau est rendu et que le bouton de démarrage reste désactivé tant que le cinq n'est pas complet — **ne pas simplement le supprimer**.

- [ ] **Step 3: Retirer les références aux écrans supprimés**

Dans `src/ui/olive/OliveShell.tsx` : retirer l'entrée « Classement » de `NAV_CHAMP` et de `NAV_MOBILE`, et l'entrée « Rencontres » qui pointait sur `/rencontres`. Retirer les titres correspondants de `TITLES`.

Dans `src/ui/screens/Dashboard.tsx` : `clubStanding` n'existe plus. Supprimer son import, l'appel, la variable `rank`, et la ligne d'en-tête qui affichait le rang et le championnat. Le sous-titre du club devient le nombre de rencontres jouées.

Le filtrage des rencontres par championnat introduit au projet 2 disparaît avec `clubStanding` : `teamRecord` et `teamMatches` reprennent toutes les rencontres du club.

- [ ] **Step 4: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`

Puis contrôler qu'il ne reste aucune référence aux écrans supprimés :

```bash
grep -rn "SoloLiveMatch\|LiveRouter\|standings\|clubStanding\|screens/Home\|screens/Classement" src/ || echo "aucune référence résiduelle"
```

Expected: aucune référence. Les tests qui visaient `/rencontres` ou `/classement` doivent être adaptés ou supprimés selon qu'ils couvraient encore quelque chose ; **ne pas remettre les routes pour les faire passer**.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(live): la table de marque mono-équipe devient la seule"
```

---

### Task 2 : Supprimer les chemins morts des écrans conservés

**Files:**
- Modify: `src/ui/screens/SummaryScreen.tsx`, `src/ui/screens/Summary.tsx`, `src/ui/screens/SpectatorMatch.tsx`
- Test: leurs fichiers de test respectifs

**Interfaces:**
- Consumes: `liveState(match).score.b` pour le score adverse.
- Produces: des écrans qui ne connaissent plus qu'un effectif.

Ces trois écrans contiennent aujourd'hui deux branches : un tableau de statistiques quand l'adversaire a un effectif, un encart de score global sinon. La seconde devient le seul cas.

- [ ] **Step 1: Rendre l'encart adverse inconditionnel**

Dans chacun des trois fichiers :

- supprimer la condition `match.meta.solo` et rendre systématiquement le composant d'encart adverse (`SoloOpponentCard`, `SoloOpponentLine`, `SoloOpponentPanel` selon le fichier) ;
- renommer ces composants sans le préfixe `Solo` — `OpponentCard`, `OpponentLine`, `OpponentPanel` — puisqu'ils ne décrivent plus un mode particulier ;
- supprimer la boucle `(['A', 'B'] as TeamSide[]).map(...)` qui rendait deux tableaux : il n'y a plus qu'un tableau, celui de notre équipe ;
- dans `SpectatorMatch`, supprimer le second `MetaRow` (fautes et temps-morts adverses) et la grille conditionnelle qui l'entourait ;
- dans `Summary`, la ligne « Points du banc » ne concerne plus que notre équipe : retirer sa moitié adverse.

- [ ] **Step 2: Adapter les tests**

Les tests qui vérifiaient le comportement « en mode solo » décrivent désormais le cas normal : reformuler leurs intitulés en conséquence, sans affaiblir leurs assertions.

Les tests qui vérifiaient le cas **deux équipes** — présence de deux tableaux, d'un total adverse non nul — n'ont plus d'objet et doivent être supprimés ; vérifier au préalable qu'aucune assertion utile n'y est perdue.

- [ ] **Step 3: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`

```bash
grep -rn "meta.solo\|SoloOpponent" src/ || echo "aucun chemin solo résiduel"
```

Expected: plus aucune occurrence. À ce stade `meta.solo` n'est plus lu nulle part — le champ existe encore dans le type, il disparaîtra en tâche 3.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ui): l'adversaire sans effectif devient le cas normal"
```

---

### Task 3 : Aligner le modèle de données

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/boxscore.ts`, `src/domain/totals.ts`, `src/domain/playingtime.ts`, `src/domain/teamRecord.ts`, `src/rules/ffbb.ts` si concerné, et **tous** leurs consommateurs
- Test: tous les fichiers de test concernés

**Interfaces:**
- Produces: `MatchMeta.clubId` / `MatchMeta.opponentId` (remplacent `teamAId` / `teamBId`), `Match.roster: string[]`, `playerStats(match)`, `playingTimes(match)`, `teamTotals(match)` sans paramètre de côté, et la disparition de `MatchMeta.solo`.

C'est la tâche la plus mécanique et la plus large. Elle est faisable d'un bloc parce que les tâches 1 et 2 ont déjà retiré la majeure partie des consommateurs.

- [ ] **Step 1: Changer les types**

Dans `src/domain/types.ts` :

```ts
export interface MatchMeta {
  championshipLabel?: string; championshipCode?: string; matchNumber?: string
  date?: string; time?: string; venue?: string; pool?: string
  referee1?: string; referee2?: string; referee3?: string
  coachA?: string
  /** Notre club. L'application ne détaille jamais qu'une équipe. */
  clubId: string
  /** L'adversaire : une fiche équipe sans effectif, dont on ne saisit que le score. */
  opponentId: string
}
export interface Match {
  id: string
  meta: MatchMeta
  /** Notre effectif. L'adversaire n'en a pas. */
  roster: string[]
  events: GameEvent[]
  status: 'setup' | 'live' | 'finished'
}
```

`coachB` disparaît avec l'effectif adverse.

- [ ] **Step 2: Laisser le compilateur guider le reste**

Lancer `pnpm build` et traiter chaque erreur. Les règles de transformation, sans exception :

| Avant | Après |
|---|---|
| `match.meta.teamAId` | `match.meta.clubId` |
| `match.meta.teamBId` | `match.meta.opponentId` |
| `match.roster.A` | `match.roster` |
| `match.roster.B` | *supprimé* — plus d'effectif adverse |
| `playerStats(match, side)` | `playerStats(match)` |
| `playingTimes(match, side)` | `playingTimes(match)` |
| `teamTotals(match, side)` | `teamTotals(match)` |
| `teamTotals(match, 'B').team.points` | `liveState(match).score.b` |
| `meta.solo` | *supprimé* |

**N'utilise ni `as any`, ni `@ts-ignore`, ni assertion de type pour faire taire une erreur.** Chaque erreur signale un endroit où le code supposait deux effectifs ; c'est précisément ce qu'on veut voir.

Dans `teamRecord.ts`, la fonction interne `sideOf` disparaît : notre club est le côté A par construction. `teamRecord(teamId, matches)` peut conserver sa signature — un adversaire reste une équipe dont on veut le bilan sur nos rencontres — mais son corps se simplifie.

- [ ] **Step 3: Vérifier qu'aucun vestige ne subsiste**

```bash
grep -rn "teamAId\|teamBId\|roster\.A\|roster\.B\|meta\.solo\|coachB" src/ || echo "modèle aligné"
```

Expected: aucune occurrence, fichiers de test compris. Une occurrence restante dans un test signifie que le test décrit un modèle qui n'existe plus.

- [ ] **Step 4: Vérifier que la garantie du panier d'équipe tient toujours**

C'est l'invariant le plus important du projet précédent : un panier adverse compte au score, au bilan et aux totaux par période, mais n'apparaît dans la ligne d'aucun joueur. Le changement de modèle ne doit pas l'avoir cassé.

Le test existant dans `src/domain/boxscore.test.ts` — « ignore un panier sans joueur identifié » — doit continuer de passer après adaptation au nouveau modèle. S'il n'existe plus après tes modifications, c'est une régression : rétablis-le.

- [ ] **Step 5: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(domain): un seul effectif par rencontre, l'adversaire n'est qu'un nom"
```

---

### Task 4 : Navigation et données de démonstration

**Files:**
- Modify: `src/ui/olive/OliveShell.tsx`, `src/ui/screens/Calendrier.tsx`, `src/dev/seed.ts`
- Test: `src/ui/screens/Calendrier.test.tsx` (créé), `src/dev/seed.test.ts` (créé)

**Interfaces:**
- Consumes: `useClub` (`src/app/club.tsx`), `listPlayers`, `listMatches`.
- Produces: une barre latérale listant l'effectif, un calendrier filtré, un seed mono-équipe avec rotations.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/ui/screens/Calendrier.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Calendrier } from './Calendrier'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveMatch, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const mk = (id: string, clubId: string, opponentId: string): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', clubId, opponentId },
  roster: [], events: [], status: 'setup',
})

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await saveTeam({ id: 'tb', name: 'VERDUN' })
  await saveTeam({ id: 'tc', name: 'METZ' })
  await saveMatch(mk('m1', 'ta', 'tb'))
  await saveMatch(mk('m2', 'tc', 'tb')) // rencontre sans notre club
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Calendrier', () => {
  it('n’affiche que les rencontres du club', async () => {
    render(<MemoryRouter><ClubProvider><Calendrier /></ClubProvider></MemoryRouter>)
    expect(await screen.findByText(/VERDUN/)).toBeInTheDocument()
    expect(screen.queryByText(/METZ/)).not.toBeInTheDocument()
  })
})
```

Créer `src/dev/seed.test.ts` :

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { seedDevData } from './seed'
import { db } from '../persistence/db'
import { listMatches, listPlayers, listTeams } from '../persistence/repositories'
import { playingTimes } from '../domain/playingtime'

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await seedDevData()
})

describe('données de démonstration', () => {
  it('ne crée que les équipes qui jouent', async () => {
    const teams = await listTeams()
    const matches = await listMatches()
    const utilisees = new Set(matches.flatMap((m) => [m.meta.clubId, m.meta.opponentId]))
    expect(teams.every((t) => utilisees.has(t.id))).toBe(true)
  })

  it('ne crée aucun effectif adverse', async () => {
    const matches = await listMatches()
    const adversaires = new Set(matches.map((m) => m.meta.opponentId))
    for (const id of adversaires) expect(await listPlayers(id)).toHaveLength(0)
  })

  it('produit des rotations, donc un temps de jeu crédible', async () => {
    const joue = (await listMatches()).find((m) => m.status === 'finished')!
    const temps = [...playingTimes(joue).values()].filter((t) => t > 0)
    // Sans SUBSTITUTION, seuls les cinq titulaires auraient du temps de jeu.
    expect(temps.length).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/ui/screens/Calendrier.test.tsx src/dev/seed.test.ts`
Expected: FAIL — le calendrier montre les deux rencontres, le seed crée dix équipes et aucune rotation.

- [ ] **Step 3: Lister l'effectif dans la barre latérale**

Dans `src/ui/olive/OliveShell.tsx`, `Sidebar` : remplacer la section « Équipes » par une section **« Effectif »** qui charge `listPlayers(clubId)` et liste les joueurs triés par numéro, chacun en lien vers `/players/<id>`, avec sa pastille de numéro dans le style déjà utilisé par `TeamDetail`.

Rendre la section seulement si un club est réglé et que l'effectif n'est pas vide.

- [ ] **Step 4: Filtrer le calendrier**

Dans `src/ui/screens/Calendrier.tsx` : appeler `useClub()`, et ne conserver que les rencontres dont `meta.clubId` est le club réglé. Adapter le sous-titre : « Les rencontres de votre équipe, par date. »

- [ ] **Step 5: Retravailler le seed**

Dans `src/dev/seed.ts` :

- Réduire `TEAMS` à six entrées : l'Avenir de Vignot puis ses cinq adversaires.
- Ne créer des joueurs que pour Vignot.
- Ne construire que **nos** cinq rencontres : trois terminées, une en direct, une à venir. La structure en round-robin disparaît, remplacée par une simple liste d'adversaires et de dates.
- Les paniers adverses sont des `SCORE` de `team: 'B'` **sans `playerId`**, comme le mode mono-équipe le produit déjà.
- Ajouter des **rotations** : après le `STARTING_FIVE`, alterner des `SUBSTITUTION` faisant entrer les remplaçants et sortir des titulaires, à des instants échelonnés du chrono, de sorte qu'au moins huit joueurs aient du temps de jeu.
- Étoffer les statistiques secondaires : viser au moins une vingtaine d'évènements `STAT` par rencontre, répartis sur l'effectif, pour que les moyennes par match du projet 4 soient parlantes.
- Passer `SEED_VERSION` à `'v9'`, sinon les navigateurs déjà pourvus ne régénéreront rien.

Les dates de naissance et les tailles ne sont **pas** ajoutées ici : ces champs n'existent pas encore, ils arrivent au projet 4.

- [ ] **Step 6: Vérifier**

Run: `pnpm test && pnpm lint && pnpm build`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(nav): effectif dans le menu, calendrier du club, démo mono-équipe"
```

---

## Auto-relecture

**Couverture du spec**

| Section du spec | Tâche |
|---|---|
| §1 Modèle de données | Task 3 |
| §2 Écrans et composants supprimés | Task 1 |
| §2 Chemins morts des écrans conservés | Task 2 |
| §3 Navigation | Tasks 1 (menu) et 4 (effectif, calendrier) |
| §4 Seed | Task 4 |

**Point d'attention pour l'exécutant** — la tâche 3 est un renommage large. La tentation d'utiliser une assertion de type pour faire taire une erreur du compilateur y sera forte : chaque erreur signale au contraire un endroit où le code supposait encore deux effectifs, et c'est exactement ce qu'on cherche à trouver.

**Écart assumé** — `teamRecord(teamId, matches)` conserve sa signature à deux arguments alors que notre club est désormais toujours le côté A. La raison : la fiche d'une équipe adverse affiche le bilan de nos confrontations avec elle, et cet appel passe donc un autre identifiant que le nôtre.
