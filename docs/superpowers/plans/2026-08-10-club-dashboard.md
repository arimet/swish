# Réorientation autour d'un club et tableau de bord — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de l'application l'outil d'un club — l'Avenir de Vignot — en ouvrant sur son tableau de bord plutôt que sur le championnat, sans rien retirer de ce qui existe.

**Architecture:** Un contexte React détient le club choisi, stocké dans `localStorage` comme le déverrouillage admin. Le calcul du classement remonte de l'écran vers le domaine pour être partagé. Le tableau de bord n'ajoute aucun calcul : il assemble `teamRecord`, `teamMatches`, `teamScorers`, `shotsOf` et `standings`, tous déjà écrits et testés.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Tailwind v4, react-router-dom v7, Dexie.

## Global Constraints

- Commentaires, libellés et messages de commit **en français accentué** (`é`, `è`, `à`, `ç`). Le dépôt entier est ainsi et le lint l'accepte. Si des accents disparaissent d'un fichier écrit, c'est un bug d'outillage : réécrire le fichier entier avec Write, puis vérifier avec `grep -c 'à\|é' <fichier>`.
- **Le sens des dépendances est strict : `src/domain/` n'importe jamais depuis `src/ui/`.** C'est la raison du déplacement de `champLabel` en Task 1.
- Le club choisi vit dans `localStorage`, **jamais dans la base synchronisée** : c'est une préférence d'appareil, pas une donnée de championnat.
- Une statistique absente s'affiche `—`, **jamais `0 %`**.
- Aucune dépendance npm ajoutée.
- Les tests importent explicitement `describe`/`it`/`expect` depuis `vitest`.
- Commandes : `pnpm test`, `pnpm lint`, `pnpm build`. Les trois doivent passer avant chaque commit.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/domain/standings.ts` | **Créé** — classement partagé entre l'écran Classement et le tableau de bord |
| `src/domain/ids.ts` | Accueille `champLabel`, déplacé depuis le kit visuel |
| `src/app/club.ts` | **Créé** — contexte du club choisi |
| `src/ui/screens/Welcome.tsx` | **Créé** — choix du club au premier lancement |
| `src/ui/screens/Dashboard.tsx` | **Créé** — la nouvelle page d'accueil |
| `src/App.tsx` | Routes, `ClubProvider`, garde de bienvenue |
| `src/ui/olive/OliveShell.tsx` | Menu recentré, entrée de réglage du club |
| `src/ui/screens/Classement.tsx` | Consomme `standings` au lieu de le définir |
| `src/dev/seed.ts` | Pré-règle le club de démonstration |

---

### Task 1 : Extraire le classement dans le domaine

**Files:**
- Create: `src/domain/standings.ts`, `src/domain/standings.test.ts`
- Modify: `src/domain/ids.ts`, `src/ui/olive/kit.tsx`, `src/ui/screens/Classement.tsx`

**Interfaces:**
- Consumes: `liveState` (`src/rules/ffbb.ts`), `Match`, `Team` (`src/domain/types.ts`).
- Produces: `interface StandingLine`, `standings(matches, teams)`, `clubStanding(matches, teams, clubId)`, et `champLabel` désormais exporté depuis `src/domain/ids.ts` (le kit le ré-exporte).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/domain/standings.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { clubStanding, standings } from './standings'
import type { GameEvent, Match, Team } from './types'

const TEAMS: Record<string, Team> = {
  a: { id: 'a', name: 'VIGNOT' }, b: { id: 'b', name: 'VERDUN' }, c: { id: 'c', name: 'METZ' },
}

/** Rencontre terminée : `pa` paniers à 2 pts pour A, `pb` pour B. */
const mk = (id: string, teamAId: string, teamBId: string, pa: number, pb: number, champ = 'Poule A'): Match => {
  const events: GameEvent[] = [{ id: `${id}-c`, wallClock: 0, period: 1, gameClock: 600, type: 'CLOCK_START' }]
  for (let i = 0; i < pa; i++) events.push({ id: `${id}-a${i}`, wallClock: i, period: 1, gameClock: 500, type: 'SCORE', team: 'A', playerId: 'p', kind: '2int' })
  for (let i = 0; i < pb; i++) events.push({ id: `${id}-b${i}`, wallClock: 100 + i, period: 1, gameClock: 400, type: 'SCORE', team: 'B', playerId: 'q', kind: '2int' })
  return { id, meta: { championshipLabel: champ, teamAId, teamBId }, roster: { A: [], B: [] }, events, status: 'finished' }
}

describe('standings', () => {
  it('applique le barème : victoire 2 points, défaite 1 point', () => {
    const [table] = standings([mk('m1', 'a', 'b', 10, 5)], TEAMS)
    expect(table.champ).toBe('Poule A')
    expect(table.lines.map((l) => [l.id, l.v, l.d, l.pts])).toEqual([['a', 1, 0, 2], ['b', 0, 1, 1]])
  })

  it('départage à égalité de points par la différence de points', () => {
    const [table] = standings([mk('m1', 'a', 'b', 10, 5), mk('m2', 'c', 'b', 4, 2)], TEAMS)
    // a et c gagnent chacun : 2 pts, mais a a +10 de différence contre +4 pour c.
    expect(table.lines.slice(0, 2).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('ignore les rencontres non terminées', () => {
    const m = { ...mk('m1', 'a', 'b', 10, 5), status: 'live' as const }
    expect(standings([m], TEAMS)).toEqual([])
  })

  it('sépare les championnats', () => {
    const tables = standings([mk('m1', 'a', 'b', 10, 5), mk('m2', 'a', 'c', 6, 4, 'Coupe')], TEAMS)
    expect(tables.map((t) => t.champ).sort()).toEqual(['Coupe', 'Poule A'])
  })
})

describe('clubStanding', () => {
  it('donne la place du club dans son championnat', () => {
    const ms = [mk('m1', 'a', 'b', 10, 5), mk('m2', 'c', 'a', 20, 2)]
    const s = clubStanding(ms, TEAMS, 'a')
    expect(s).not.toBeNull()
    expect(s!.rank).toBe(2) // c est premier (victoire large), a deuxième
    expect(s!.total).toBe(3)
    expect(s!.line.id).toBe('a')
  })

  it('renvoie null sans rencontre terminée', () => {
    expect(clubStanding([], TEAMS, 'a')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/domain/standings.test.ts`
Expected: FAIL — `Failed to resolve import "./standings"`.

- [ ] **Step 3: Déplacer `champLabel` dans le domaine**

`standings` a besoin de `champLabel`, qui vit aujourd'hui dans `src/ui/olive/kit.tsx`. Le domaine ne doit jamais importer depuis l'interface : déplace la fonction plutôt que d'inverser la dépendance.

Dans `src/domain/ids.ts`, ajouter l'import du type et la fonction :

```ts
import type { Match, MatchMeta, Period } from './types'
```

```ts
/** Libellé de championnat avec repli quand la rencontre n'en a pas. */
export const champLabel = (meta: MatchMeta) => meta.championshipLabel?.trim() || 'Match amical'
```

Dans `src/ui/olive/kit.tsx`, supprimer la définition locale (ligne 10) et la remplacer par une ré-exportation, pour que les cinq écrans qui l'importent depuis le kit ne changent pas :

```tsx
export { champLabel } from '../../domain/ids'
```

- [ ] **Step 4: Écrire `src/domain/standings.ts`**

Le corps de `standings` est **repris à l'identique** de `src/ui/screens/Classement.tsx` : ce projet ne change pas le classement, il le partage.

```ts
import { liveState } from '../rules/ffbb'
import { champLabel } from './ids'
import type { Match, Team } from './types'

export interface StandingLine {
  id: string; name: string
  j: number; v: number; d: number
  pf: number; pa: number; pts: number
}

/** Classement FFBB simplifié : victoire = 2 pts, défaite = 1 pt (matchs terminés). */
export function standings(matches: Match[], teams: Record<string, Team>): { champ: string; lines: StandingLine[] }[] {
  const byChamp = new Map<string, Map<string, StandingLine>>()
  const ensure = (champ: string, id: string) => {
    if (!byChamp.has(champ)) byChamp.set(champ, new Map())
    const m = byChamp.get(champ)!
    if (!m.has(id)) m.set(id, { id, name: teams[id]?.name ?? id, j: 0, v: 0, d: 0, pf: 0, pa: 0, pts: 0 })
    return m.get(id)!
  }
  for (const match of matches) {
    if (match.status !== 'finished') continue
    const { score } = liveState(match)
    const A = ensure(champLabel(match.meta), match.meta.teamAId)
    const B = ensure(champLabel(match.meta), match.meta.teamBId)
    A.j++; B.j++; A.pf += score.a; A.pa += score.b; B.pf += score.b; B.pa += score.a
    if (score.a >= score.b) { A.v++; A.pts += 2; B.d++; B.pts += 1 } else { B.v++; B.pts += 2; A.d++; A.pts += 1 }
  }
  return [...byChamp.entries()].map(([champ, m]) => ({
    champ,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa)),
  }))
}

/** Place du club dans son championnat. `null` s'il n'apparaît dans aucune rencontre
 *  terminée — auquel cas afficher un rang serait inventer une information. */
export function clubStanding(
  matches: Match[], teams: Record<string, Team>, clubId: string,
): { rank: number; total: number; line: StandingLine } | null {
  for (const { lines } of standings(matches, teams)) {
    const i = lines.findIndex((l) => l.id === clubId)
    if (i >= 0) return { rank: i + 1, total: lines.length, line: lines[i] }
  }
  return null
}
```

- [ ] **Step 5: Faire consommer l'écran Classement**

Dans `src/ui/screens/Classement.tsx` : supprimer le type `Line` et la fonction `standings` locale (lignes 8-31), et les remplacer par l'import

```tsx
import { standings } from '../../domain/standings'
```

Supprimer aussi les imports devenus inutiles (`liveState`, `champLabel`, le type `Match` s'il n'est plus référencé). `pnpm lint` signalera ceux qui restent.

- [ ] **Step 6: Lancer les tests et le build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert. Vérifie que `src/domain/standings.ts` n'importe rien depuis `src/ui/` :

```bash
grep -n "ui/" src/domain/standings.ts || echo "aucune dépendance vers l'interface"
```

- [ ] **Step 7: Commit**

```bash
git add src/domain/standings.ts src/domain/standings.test.ts src/domain/ids.ts src/ui/olive/kit.tsx src/ui/screens/Classement.tsx
git commit -m "refactor(domain): classement extrait de l'écran pour être partagé"
```

---

### Task 2 : Le club choisi et l'écran de bienvenue

**Files:**
- Create: `src/app/club.tsx`, `src/ui/screens/Welcome.tsx`, `src/app/club.test.tsx`
- Modify: `src/App.tsx`, `src/dev/seed.ts`

**Interfaces:**
- Consumes: `listTeams` (`src/persistence/repositories.ts`), `Team`.
- Produces: `ClubProvider`, `useClub(): { clubId, club, teams, ready, setClub, clear }`, composant `Welcome`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/app/club.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ClubProvider, useClub } from './club'
import { db } from '../persistence/db'
import { saveTeam } from '../persistence/repositories'

function Probe() {
  const { clubId, club, ready } = useClub()
  if (!ready) return <p>chargement</p>
  return <p>club: {clubId ?? 'aucun'} / {club?.name ?? '—'}</p>
}

const renderProbe = () => render(<ClubProvider><Probe /></ClubProvider>)

beforeEach(async () => {
  localStorage.clear()
  await db.teams.clear()
  await saveTeam({ id: 't1', name: 'VIGNOT' })
  await saveTeam({ id: 't2', name: 'VERDUN' })
})

describe('useClub', () => {
  it('démarre sans club choisi', async () => {
    renderProbe()
    expect(await screen.findByText(/club: aucun/)).toBeInTheDocument()
  })

  it('relit le club enregistré au démarrage', async () => {
    localStorage.setItem('swish-club-id', 't1')
    renderProbe()
    expect(await screen.findByText(/club: t1 \/ VIGNOT/)).toBeInTheDocument()
  })

  it('oublie un club dont l’équipe n’existe plus', async () => {
    localStorage.setItem('swish-club-id', 'supprimee')
    renderProbe()
    // Sans ce garde, l'application resterait bloquée sur un tableau de bord vide.
    expect(await screen.findByText(/club: aucun/)).toBeInTheDocument()
  })
})

describe('Welcome', () => {
  it('enregistre le club choisi', async () => {
    const { Welcome } = await import('../ui/screens/Welcome')
    render(<ClubProvider><Welcome /></ClubProvider>)
    await userEvent.click(await screen.findByRole('button', { name: /VIGNOT/ }))
    expect(localStorage.getItem('swish-club-id')).toBe('t1')
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/app/club.test.tsx`
Expected: FAIL — `Failed to resolve import "./club"`.

- [ ] **Step 3: Écrire le contexte**

Créer `src/app/club.tsx` :

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listTeams } from '../persistence/repositories'
import type { Team } from '../domain/types'

/** Club suivi par cet appareil. Préférence locale, jamais synchronisée : deux
 *  personnes du même club ne partagent pas forcément le même appareil, et une
 *  tablette prêtée à l'adversaire n'a pas à lui pousser ce réglage. */
const KEY = 'swish-club-id'

interface ClubCtx {
  clubId: string | null
  club: Team | null
  teams: Team[]
  /** `false` tant que les équipes ne sont pas chargées : sans cela, l'écran de
   *  bienvenue clignoterait à chaque démarrage avant que le club soit résolu. */
  ready: boolean
  setClub: (id: string) => void
  clear: () => void
}
const Ctx = createContext<ClubCtx | null>(null)

export function ClubProvider({ children }: { children: ReactNode }) {
  const [clubId, setClubId] = useState<string | null>(() => localStorage.getItem(KEY))
  const [teams, setTeams] = useState<Team[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    listTeams().then((ts) => {
      if (cancelled) return
      setTeams(ts)
      // Équipe supprimée depuis un autre appareil : on oublie le réglage plutôt
      // que de laisser l'application sur un tableau de bord vide sans issue.
      setClubId((id) => (id && ts.some((t) => t.id === id) ? id : null))
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  const setClub = useCallback((id: string) => { localStorage.setItem(KEY, id); setClubId(id) }, [])
  const clear = useCallback(() => { localStorage.removeItem(KEY); setClubId(null) }, [])

  const club = teams.find((t) => t.id === clubId) ?? null
  return <Ctx.Provider value={{ clubId, club, teams, ready, setClub, clear }}>{children}</Ctx.Provider>
}

export function useClub(): ClubCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClub doit être utilisé dans un ClubProvider')
  return ctx
}
```

- [ ] **Step 4: Écrire l'écran de bienvenue**

Créer `src/ui/screens/Welcome.tsx` :

```tsx
import { Link } from 'react-router-dom'
import { useClub } from '../../app/club'
import { C, bd, TeamBadge } from '../olive/kit'

/** Premier lancement : choisir le club suivi. Affiché à la place du shell tant
 *  qu'aucun club valide n'est réglé — ce n'est pas une route dont on s'échappe. */
export function Welcome() {
  const { teams, setClub } = useClub()
  return (
    <div className="grid min-h-dvh place-items-center p-6" style={{ background: C.page, color: C.text }}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl text-xl" style={{ background: C.orange }}>🏀</span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Bienvenue sur Swish</h1>
            <p className="text-sm" style={{ color: C.muted }}>Quel club suivez-vous ?</p>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ border: `1px dashed ${C.border}` }}>
            <p className="text-sm" style={{ color: C.muted }}>Aucune équipe enregistrée pour l’instant.</p>
            <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
              Créer ma première équipe →
            </Link>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {teams.map((t) => (
              <li key={t.id}>
                <button onClick={() => setClub(t.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:brightness-125"
                  style={{ background: C.card, border: bd }}>
                  <TeamBadge id={t.id} name={t.name} size="h-9 w-9 text-[11px]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</span>
                  <span style={{ color: C.faint }}>→</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 text-center text-[12px]" style={{ color: C.faint }}>
          Ce choix se modifie ensuite depuis le menu.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Brancher la garde dans `App.tsx`**

Envelopper l'application dans `ClubProvider` et n'entrer dans le shell qu'une fois un club choisi. Ajouter les imports puis remplacer le corps de `App` :

```tsx
import { ClubProvider, useClub } from './app/club'
import { Welcome } from './ui/screens/Welcome'
```

```tsx
/** Tant qu'aucun club valide n'est réglé, l'application est l'écran de bienvenue.
 *  Le suivi spectateur reste accessible sans club : il se partage à des gens qui
 *  n'ont pas l'application réglée. */
function ClubGate() {
  const { clubId, ready } = useClub()
  if (!ready) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>
  if (!clubId) return <Welcome />
  return <OliveShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <ClubProvider>
        <AdminProvider>
          <Routes>
            {/* Suivi spectateur : plein écran, hors du shell (projetable) */}
            <Route path="/match/:id/watch" element={<SpectatorRoute />} />
            <Route element={<ClubGate />}>
              {/* … routes existantes inchangées … */}
            </Route>
          </Routes>
        </AdminProvider>
      </ClubProvider>
    </BrowserRouter>
  )
}
```

> `ClubGate` remplace `<OliveShell />` comme élément de la route parente ; les routes enfants ne changent pas.

- [ ] **Step 6: Pré-régler le club de démonstration**

Dans `src/dev/seed.ts`, à la fin de `seedDevData`, après `localStorage.setItem('seed-version', SEED_VERSION)` :

```ts
  // L'Avenir de Vignot est le club de démonstration : sans cela, la démo s'ouvre
  // sur l'écran de bienvenue à chaque régénération des données.
  if (!localStorage.getItem('swish-club-id')) localStorage.setItem('swish-club-id', teamId(0))
```

- [ ] **Step 7: Lancer les tests et le build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert. Les tests d'écrans existants qui montent `App` peuvent nécessiter un club en `localStorage` dans leur `beforeEach` ; les adapter, **ne pas retirer la garde**.

- [ ] **Step 8: Commit**

```bash
git add src/app/club.tsx src/app/club.test.tsx src/ui/screens/Welcome.tsx src/App.tsx src/dev/seed.ts
git commit -m "feat(club): choix du club suivi et écran de bienvenue au premier lancement"
```

---

### Task 3 : Tableau de bord et menu recentré

**Files:**
- Create: `src/ui/screens/Dashboard.tsx`, `src/ui/screens/Dashboard.test.tsx`
- Modify: `src/App.tsx`, `src/ui/olive/OliveShell.tsx`

**Interfaces:**
- Consumes: `useClub` (Task 2), `clubStanding` (Task 1), `teamRecord`/`teamMatches`/`teamScorers` (`src/domain/teamRecord.ts`), `shotsOf`/`shootingPct` (`src/domain/shotchart.ts`), `ShotChart` (`src/ui/components/ShotCourt.tsx`), `liveState`, `displayClock`/`fmtDate`/`TeamBadge`/`C`/`bd` (`src/ui/olive/kit.tsx`).
- Produces: composant `Dashboard` monté sur `/`, ancien accueil déplacé sur `/rencontres`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/ui/screens/Dashboard.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import { ClubProvider } from '../../app/club'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

const finished = (id: string, pa: number, pb: number, events: Partial<GameEvent>[] = []): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', teamAId: 'ta', teamBId: 'tb' },
  roster: { A: ['p1'], B: [] }, status: 'finished',
  events: [
    { type: 'CLOCK_START' },
    ...Array.from({ length: pa }, () => ({ type: 'SCORE' as const, team: 'A' as const, playerId: 'p1', kind: '2int' as const })),
    ...Array.from({ length: pb }, () => ({ type: 'SCORE' as const, team: 'B' as const, kind: '2int' as const })),
    ...events,
  ].map(ev),
})

const renderDash = () =>
  render(<MemoryRouter><ClubProvider><Dashboard /></ClubProvider></MemoryRouter>)

beforeEach(async () => {
  localStorage.clear()
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  localStorage.setItem('swish-club-id', 'ta')
})

describe('Dashboard', () => {
  it('affiche le bilan du club', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText('VIGNOT')).toBeInTheDocument()
    expect(await screen.findByText('1V – 0D')).toBeInTheDocument()
  })

  it('met le match en direct en tête', async () => {
    await saveMatch({ ...finished('m2', 6, 4), id: 'm2', status: 'live' })
    renderDash()
    expect(await screen.findByRole('link', { name: /table de marque/i })).toBeInTheDocument()
  })

  it('annonce la prochaine rencontre quand aucun match n’est en cours', async () => {
    await saveMatch({ ...finished('m3', 0, 0), id: 'm3', status: 'setup' })
    renderDash()
    expect(await screen.findByText(/prochaine rencontre/i)).toBeInTheDocument()
  })

  it('n’affiche pas de hot zone vide sans explication', async () => {
    await saveMatch(finished('m1', 10, 4))
    renderDash()
    expect(await screen.findByText(/aucun tir localisé/i)).toBeInTheDocument()
  })

  it('affiche la hot zone du club dès qu’un tir est localisé', async () => {
    await saveMatch(finished('m1', 10, 4, [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]))
    renderDash()
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/screens/Dashboard.test.tsx`
Expected: FAIL — `Failed to resolve import "./Dashboard"`.

- [ ] **Step 3: Écrire le tableau de bord**

Créer `src/ui/screens/Dashboard.tsx` :

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useClub } from '../../app/club'
import { listMatches, listPlayers, listTeams } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { clubStanding } from '../../domain/standings'
import { teamMatches, teamRecord, teamScorers } from '../../domain/teamRecord'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { liveState } from '../../rules/ffbb'
import { ShotChart } from '../components/ShotCourt'
import { C, bd, TeamBadge, displayClock, fmtDate } from '../olive/kit'
import type { Match, Player, Team } from '../../domain/types'

export function Dashboard() {
  const { clubId, club } = useClub()
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    refresh()
      .then(() => Promise.all([listMatches(), listTeams(), listPlayers(clubId)]))
      .then(([ms, ts, ps]) => {
        if (cancelled) return
        setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
        setPlayers(ps)
        setMatches(ms)
      })
    return () => { cancelled = true }
  }, [clubId])

  if (!clubId || !club) return null
  if (!matches) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>

  const mine = matches.filter((m) => m.meta.teamAId === clubId || m.meta.teamBId === clubId)
  const live = mine.find((m) => m.status === 'live')
  const next = mine.filter((m) => m.status === 'setup').sort((a, b) => (a.meta.date ?? '').localeCompare(b.meta.date ?? ''))[0]
  const rec = teamRecord(clubId, matches)
  const lines = teamMatches(clubId, matches).filter((l) => l.result)
  const rank = clubStanding(matches, teams, clubId)
  const diff = rec.pointsFor - rec.pointsAgainst

  const rosterIds = players.map((p) => p.id)
  const clubShots = rosterIds.flatMap((id) => shotsOf(matches, id))
  const scorers = [...teamScorers(clubId, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const shownShots = openPlayer ? shotsOf(matches, openPlayer) : clubShots

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <TeamBadge id={club.id} name={club.name} size="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{club.name}</h1>
            <p className="text-sm" style={{ color: C.muted }}>
              {rank ? `${rank.rank}ᵉ sur ${rank.total} · ${rank.line.pts} pts` : 'Aucune rencontre terminée'}
            </p>
          </div>
        </div>

        <Banner live={live} next={next} clubId={clubId} teams={teams} />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Bilan" value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? `${rec.played} rencontres` : 'aucune'} accent={rec.wins >= rec.losses ? C.green : C.pink} />
          <Stat label="Points marqués" value={rec.played ? String(rec.avgFor) : '—'} hint="par match" />
          <Stat label="Points encaissés" value={rec.played ? String(rec.avgAgainst) : '—'} hint="par match" />
          <Stat label="Différentiel" value={rec.played ? (diff > 0 ? `+${diff}` : String(diff)) : '—'} hint="sur la saison" accent={diff > 0 ? C.green : diff < 0 ? C.pink : undefined} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Forme</span>
          {lines.slice(0, 5).map((l) => (
            <span key={l.match.id} className="grid h-6 w-6 place-items-center rounded-md text-[11px] font-black"
              style={{ background: l.result === 'V' ? C.greenBg : 'rgba(255,77,109,0.14)', color: l.result === 'V' ? C.green : C.pink }}>
              {l.result}
            </span>
          ))}
          {lines.length === 0 && <span className="text-sm" style={{ color: C.muted }}>—</span>}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_420px]">
          <Panel title="Meilleurs marqueurs">
            {scorers.length === 0 ? (
              <Empty>Pas encore de points marqués.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = byId[pid]
                  const pct = shootingPct(shotsOf(matches, pid)).fg
                  return (
                    <li key={pid}>
                      <Link to={`/players/${pid}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5" style={{ background: C.panel }}>
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.orange : C.faint }}>{i + 1}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                        <span className="text-[11px] font-semibold" style={{ color: C.muted }}>{pct === null ? '—' : `${pct} %`}</span>
                        <span className="w-14 text-right text-sm font-black tabular-nums">{pts} pts</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title={openPlayer ? `Hot zone — ${byId[openPlayer]?.lastName ?? 'joueur'}` : 'Hot zone — équipe'}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip active={!openPlayer} onClick={() => setOpenPlayer(null)}>Équipe</Chip>
              {players.map((p) => (
                <Chip key={p.id} active={openPlayer === p.id} onClick={() => setOpenPlayer(p.id)}>{p.number}</Chip>
              ))}
            </div>
            {shownShots.length === 0 ? <Empty>Aucun tir localisé pour l’instant.</Empty> : <ShotChart shots={shownShots} minAttempts={openPlayer ? 1 : 3} />}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Banner({ live, next, clubId, teams }: { live?: Match; next?: Match; clubId: string; teams: Record<string, Team> }) {
  const opponent = (m: Match) => teams[m.meta.teamAId === clubId ? m.meta.teamBId : m.meta.teamAId]?.name ?? 'Adversaire'
  if (live) {
    const ls = liveState(live)
    const dc = displayClock(live)
    const mine = live.meta.teamAId === clubId ? ls.score.a : ls.score.b
    const opp = live.meta.teamAId === clubId ? ls.score.b : ls.score.a
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accent}55` }}>
        <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: C.greenBg, color: C.green }}>En direct</span>
        <span className="nums text-3xl font-black tabular-nums">{mine} – {opp}</span>
        <span className="text-sm font-bold" style={{ color: C.muted }}>contre {opponent(live)}</span>
        <span className="nums text-sm font-bold" style={{ color: C.faint }}>{dc.label} · {dc.clock}</span>
        <Link to={`/match/${live.id}/live`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
          Ouvrir la table de marque →
        </Link>
      </div>
    )
  }
  if (next) {
    const f = fmtDate(next.meta.date)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>Prochaine rencontre</span>
        <span className="text-sm font-bold">contre {opponent(next)}</span>
        <span className="text-sm" style={{ color: C.muted }}>{[f.long, next.meta.time, next.meta.venue].filter(Boolean).join(' · ')}</span>
        <Link to={`/match/${next.id}`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>Voir la fiche →</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-sm" style={{ color: C.muted }}>Aucune rencontre prévue.</span>
      <Link to="/match/new" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>+ Planifier une rencontre</Link>
    </div>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{title}</p>
      {children}
    </section>
  )
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition"
      style={active ? { background: C.accent, color: '#fff' } : { background: C.card2, color: C.muted, border: bd }}>
      {children}
    </button>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
```

- [ ] **Step 4: Déplacer l'ancien accueil et monter le tableau de bord**

Dans `src/App.tsx` : importer `Dashboard`, monter la route index dessus, et déplacer `Home` sur `/rencontres`.

```tsx
          <Route index element={<Dashboard />} />
          <Route path="/rencontres" element={<Home />} />
```

- [ ] **Step 5: Recentrer le menu**

Dans `src/ui/olive/OliveShell.tsx`, remplacer la constante `NAV` par deux groupes et adapter les titres :

```tsx
const NAV_CLUB = [
  { icon: ICON.trophy, label: 'Tableau de bord', to: '/', end: true },
]
const NAV_CHAMP = [
  { icon: ICON.matches, label: 'Rencontres', to: '/rencontres', end: false },
  { icon: ICON.cal, label: 'Calendrier', to: '/calendrier', end: false },
  { icon: ICON.trophy, label: 'Classement', to: '/classement', end: false },
  { icon: ICON.users, label: 'Équipes', to: '/teams', end: false },
]
const TITLES: Record<string, string> = {
  '/': 'Tableau de bord', '/rencontres': 'Rencontres', '/calendrier': 'Calendrier',
  '/teams': 'Équipes', '/classement': 'Classement', '/match/new': 'Nouvelle rencontre',
}
```

Dans `Sidebar`, appeler `useClub()` et rendre :
- un groupe **Mon club** contenant « Tableau de bord » et un lien « Mon équipe » vers `/teams/${clubId}` (rendu seulement si `clubId` existe) ;
- un groupe **Championnat** avec `NAV_CHAMP` ;
- la liste des équipes existante, sous Championnat ;
- au-dessus du bouton admin, un bouton « Changer de club » appelant `clear()`.

Dans `MobileNav`, garder quatre entrées : Tableau de bord, Rencontres, Classement, Équipes.

- [ ] **Step 6: Lancer les tests et le build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert. Les tests qui naviguaient vers `/` en attendant l'ancien accueil doivent viser `/rencontres` ; ne pas remettre `Home` sur `/` pour les faire passer.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/Dashboard.tsx src/ui/screens/Dashboard.test.tsx src/App.tsx src/ui/olive/OliveShell.tsx
git commit -m "feat(dashboard): tableau de bord du club en page d'accueil, championnat en second"
```

---

## Auto-relecture

**Couverture du spec**

| Section du spec | Tâche |
|---|---|
| §1 Mon club, garde du club supprimé | Task 2 |
| §2 Écran de bienvenue | Task 2 |
| §3 Menu recentré, accueil déplacé sur `/rencontres` | Task 3, steps 4-5 |
| §4 Tableau de bord, quatre blocs | Task 3, step 3 |
| §5 Extraction du classement | Task 1 |

**Cohérence des types** — `StandingLine` et `clubStanding` sont définis en Task 1 et consommés en Task 3 sous les mêmes noms. `useClub` est défini en Task 2 et consommé par `Dashboard` et `Sidebar` en Task 3. `ShotChart` et `shotsOf`/`shootingPct` viennent du projet précédent, inchangés.

**Point d'attention pour l'exécutant** — la Task 2 place une garde devant tout le shell. Tout test existant qui monte `App` ou une route sous le shell devra régler `swish-club-id` dans son `beforeEach`. C'est le changement le plus susceptible de casser des tests éloignés du code modifié.
