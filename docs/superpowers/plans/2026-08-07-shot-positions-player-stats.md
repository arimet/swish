# Positions de tir, stats joueur et mode « une seule équipe » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saisir la position de chaque tir (réussi ou manqué) sur un demi-terrain, en déduire les points, et exposer les hot zones par joueur sur un match et sur sa carrière — plus un mode de match où seule son équipe est détaillée.

**Architecture:** Le journal d'évènements reste la source de vérité. `SCORE` gagne un champ optionnel `shot`, un nouveau type `MISS` porte les tirs manqués, et `playerId` devient optionnel pour représenter un panier d'équipe sans joueur identifié. Toute la géométrie vit dans un module pur (`shotzones.ts`) testé isolément ; l'UI ne fait que convertir un clic en coordonnées normalisées.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Tailwind v4, Dexie (IndexedDB), react-router-dom v7.

## Global Constraints

- Commentaires, libellés et messages de commit **en français** (convention du dépôt).
- Coordonnées de tir **normalisées 0..1** : `x` de la touche gauche à la touche droite, `y` de la ligne de fond à la ligne médiane. Jamais de pixels en base.
- **Aucune migration Dexie** : les évènements vivent dans le document match. Les matchs existants doivent rester lisibles.
- Un tir **sur** la ligne à 3 points vaut **2 points** (règle FIBA).
- Une zone à **moins de 3 tentatives** ne s'affiche jamais colorée (un « 100 % » sur un tir est mensonger).
- Les tests tournent avec `globals: true` : `describe`/`it`/`expect` importés explicitement de `vitest`, comme dans `src/domain/boxscore.test.ts`.
- Commande de test : `pnpm test`. Lint : `pnpm lint`. Build : `pnpm build`.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `src/domain/shotzones.ts` | Géométrie pure : coordonnée → zone → type de panier. Zéro dépendance. |
| `src/domain/shotzones.test.ts` | Fige les frontières de zones, y compris les cas limites. |
| `src/domain/shotchart.ts` | Agrégation : tirs d'un joueur sur N matchs, cumuls par zone, pourcentages. |
| `src/domain/shotchart.test.ts` | Agrégation multi-matchs, exclusion des lancers francs. |
| `src/ui/components/ShotCourt.tsx` | SVG du demi-terrain : tracés, saisie (`ShotPicker`), carte de chaleur (`ShotChart`). |
| `src/ui/components/ShotCourt.test.tsx` | Le clic renvoie les bonnes coordonnées ; la carte affiche les ratios. |
| `src/ui/components/Scoreboard.tsx` | Éléments de scoreboard partagés entre l'écran deux équipes et l'écran solo. |
| `src/ui/screens/PlayerDetail.tsx` | Fiche joueur : totaux carrière, hot zone, historique. |
| `src/ui/screens/SoloLiveMatch.tsx` | Écran live du mode « une seule équipe ». |
| `src/ui/screens/LiveRouter.tsx` | Aiguille `/match/:id/live` vers l'écran solo ou l'écran deux équipes. |

**Modifiés** — `src/domain/types.ts`, `src/domain/boxscore.ts`, `src/ui/components/PlayerActionDialog.tsx`, `src/ui/components/TeamPanel.tsx`, `src/ui/components/StartingFiveGate.tsx`, `src/ui/screens/LiveMatch.tsx`, `src/ui/screens/SummaryScreen.tsx`, `src/ui/screens/MatchSetup.tsx`, `src/ui/screens/TeamDetail.tsx`, `src/App.tsx`, `src/dev/seed.ts`.

**Volontairement inchangés** — `rules/ffbb.ts`, `domain/totals.ts`, `domain/progression.ts`, `domain/teamRecord.ts`, `ui/screens/Classement.tsx`, `ui/screens/SpectatorMatch.tsx`, `export/*`. Ils filtrent tous sur `e.type === 'SCORE'` et agrègent par équipe sans lire `playerId` : `MISS` les traverse sans effet et un panier sans joueur y compte correctement.

---

### Task 1 : Géométrie des zones

**Files:**
- Create: `src/domain/shotzones.ts`
- Test: `src/domain/shotzones.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type ShotZone`, `ZONES: ShotZone[]`, `ZONE_LABELS: Record<ShotZone, string>`, `ZONE_CENTROID: Record<ShotZone, { x: number; y: number }>`, `zoneAt(x: number, y: number): ShotZone`, `kindAt(x: number, y: number): '2int' | '2ext' | '3'`, `isThree(z: ShotZone): boolean`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/domain/shotzones.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { kindAt, zoneAt, ZONE_CENTROID, ZONES } from './shotzones'

describe('zoneAt', () => {
  it('classe un point représentatif dans chaque zone', () => {
    expect(zoneAt(0.5, 0.15)).toBe('paint')
    expect(zoneAt(0.25, 0.2)).toBe('mid_left')
    expect(zoneAt(0.5, 0.5)).toBe('mid_center')
    expect(zoneAt(0.75, 0.2)).toBe('mid_right')
    expect(zoneAt(0.03, 0.1)).toBe('corner3_left')
    expect(zoneAt(0.97, 0.1)).toBe('corner3_right')
    expect(zoneAt(0.5, 0.65)).toBe('top3')
  })

  it('place chaque centroïde dans sa propre zone', () => {
    for (const z of ZONES) expect(zoneAt(ZONE_CENTROID[z].x, ZONE_CENTROID[z].y)).toBe(z)
  })

  it('sous la jonction corner/arc, seule la ligne de corner compte', () => {
    // À 5 cm au-delà de la ligne de corner : 3 points.
    expect(zoneAt(0.05, 0.05)).toBe('corner3_left')
    // À 30 cm en deçà : 2 points, même si la distance au panier dépasse 6,75 m.
    expect(zoneAt(0.08, 0.02)).toBe('mid_left')
  })

  it('au-dessus de la jonction, la bande de corner devient une aile à 3 points', () => {
    expect(zoneAt(0.03, 0.5)).toBe('top3')
  })

  it('un tir juste en deçà de l’arc vaut 2, juste au-delà vaut 3', () => {
    expect(zoneAt(0.5, 0.57)).toBe('mid_center')
    expect(zoneAt(0.5, 0.62)).toBe('top3')
  })

  it('sort de la raquette dès qu’on dépasse sa ligne de fond', () => {
    expect(zoneAt(0.5, 0.4)).toBe('paint')
    expect(zoneAt(0.5, 0.43)).toBe('mid_center')
  })
})

describe('kindAt', () => {
  it('déduit le type de panier de la zone', () => {
    expect(kindAt(0.5, 0.15)).toBe('2int')
    expect(kindAt(0.25, 0.2)).toBe('2ext')
    expect(kindAt(0.5, 0.65)).toBe('3')
    expect(kindAt(0.03, 0.1)).toBe('3')
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/domain/shotzones.test.ts`
Expected: FAIL — `Failed to resolve import "./shotzones"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/domain/shotzones.ts` :

```ts
/**
 * Géométrie d'un demi-terrain FIBA (15 × 14 m), cotée en mètres en interne.
 * Les coordonnées publiques sont normalisées : x 0..1 de la touche gauche à la
 * touche droite, y 0..1 de la ligne de fond à la ligne médiane.
 */
const COURT_W = 15
const COURT_D = 14
const BASKET_X = 7.5
const BASKET_Y = 1.575
const ARC_R = 6.75
const CORNER_X = 0.9        // distance entre la ligne de corner et la touche
const PAINT_HALF_W = 2.45
const PAINT_D = 5.8
/** Ordonnée de la jonction entre la ligne de corner et l'arc (≈ 2,99 m). */
const CORNER_Y = BASKET_Y + Math.sqrt(ARC_R ** 2 - (BASKET_X - CORNER_X) ** 2)

export type ShotZone =
  | 'paint' | 'mid_left' | 'mid_center' | 'mid_right'
  | 'corner3_left' | 'top3' | 'corner3_right'

export const ZONES: ShotZone[] = [
  'paint', 'mid_left', 'mid_center', 'mid_right', 'corner3_left', 'top3', 'corner3_right',
]

export const ZONE_LABELS: Record<ShotZone, string> = {
  paint: 'Raquette',
  mid_left: 'Mi-distance gauche',
  mid_center: 'Mi-distance axe',
  mid_right: 'Mi-distance droite',
  corner3_left: 'Corner gauche',
  top3: 'Aile / axe à 3 pts',
  corner3_right: 'Corner droit',
}

/**
 * Centre visuel de chaque zone. Sert d'ancre aux libellés de la carte, et de
 * position enregistrée quand le tir est saisi au clavier (zone sans point précis).
 */
export const ZONE_CENTROID: Record<ShotZone, { x: number; y: number }> = {
  paint: { x: 0.5, y: 0.21 },
  mid_left: { x: 0.22, y: 0.22 },
  mid_center: { x: 0.5, y: 0.47 },
  mid_right: { x: 0.78, y: 0.22 },
  corner3_left: { x: 0.03, y: 0.12 },
  top3: { x: 0.5, y: 0.68 },
  corner3_right: { x: 0.97, y: 0.12 },
}

export function zoneAt(x: number, y: number): ShotZone {
  const mx = x * COURT_W
  const my = y * COURT_D

  // Un tir sur une ligne vaut 2 points : il faut être strictement au-delà.
  if (my <= CORNER_Y) {
    // Sous la jonction, c'est la ligne de corner (6,60 m du panier) qui délimite
    // les 3 points, et non l'arc (6,75 m) qui passe plus loin à cet endroit.
    if (mx < CORNER_X) return 'corner3_left'
    if (mx > COURT_W - CORNER_X) return 'corner3_right'
  } else if (Math.hypot(mx - BASKET_X, my - BASKET_Y) > ARC_R) {
    return 'top3'
  }

  if (Math.abs(mx - BASKET_X) <= PAINT_HALF_W && my <= PAINT_D) return 'paint'
  if (mx < BASKET_X - PAINT_HALF_W) return 'mid_left'
  if (mx > BASKET_X + PAINT_HALF_W) return 'mid_right'
  return 'mid_center'
}

export const isThree = (z: ShotZone): boolean =>
  z === 'corner3_left' || z === 'corner3_right' || z === 'top3'

export function kindAt(x: number, y: number): '2int' | '2ext' | '3' {
  const z = zoneAt(x, y)
  if (isThree(z)) return '3'
  return z === 'paint' ? '2int' : '2ext'
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm test src/domain/shotzones.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/shotzones.ts src/domain/shotzones.test.ts
git commit -m "feat(domain): géométrie des 7 zones de tir d'un demi-terrain FIBA"
```

---

### Task 2 : Modèle d'évènement — position, tir manqué, panier d'équipe

**Files:**
- Modify: `src/domain/types.ts:18-30`, `src/domain/boxscore.ts:3-60`
- Test: `src/domain/boxscore.test.ts`

**Interfaces:**
- Consumes: rien de la Task 1.
- Produces: `interface ShotSpot { x: number; y: number }`, l'évènement `MISS`, `SCORE.shot?: ShotSpot`, `SCORE.playerId?: string`, `MatchMeta.solo?: true`, `PlayerStat.misses: number`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/domain/boxscore.test.ts` :

```ts
describe('playerStats — tirs manqués et paniers d’équipe', () => {
  it('compte les tirs manqués sans ajouter de points', () => {
    const m = mk([
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.65 } },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.7 } },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', shot: { x: 0.5, y: 0.15 } },
    ])
    const [p1] = playerStats(m, 'A')
    expect(p1.points).toBe(3)
    expect(p1.fieldGoalsMade).toBe(1)
    expect(p1.misses).toBe(2)
  })

  it('ignore un panier sans joueur identifié dans les lignes individuelles', () => {
    const m = mk([
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' },
      { type: 'SCORE', team: 'A', kind: '3' }, // panier d'équipe (mode solo côté adverse)
    ])
    const stats = playerStats(m, 'A')
    expect(stats.reduce((n, s) => n + s.points, 0)).toBe(2)
  })
})
```

Ajouter dans `src/rules/ffbb.test.ts` :

```ts
it('compte un panier sans joueur identifié dans le score de l’équipe', () => {
  const m = mk([
    { type: 'CLOCK_START', period: 1, gameClock: 600 },
    { type: 'SCORE', team: 'B', kind: '3', period: 1, gameClock: 500 },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: { x: 0.5, y: 0.7 }, period: 1, gameClock: 490 },
  ])
  expect(liveState(m).score).toEqual({ a: 0, b: 3 })
})
```

> Réutiliser le helper `mk` déjà présent en haut de `src/rules/ffbb.test.ts`. S'il n'expose pas les mêmes champs, copier le helper de `boxscore.test.ts` (visible en tête de ce fichier) plutôt que d'en inventer un.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/domain/boxscore.test.ts src/rules/ffbb.test.ts`
Expected: FAIL — TypeScript rejette `type: 'MISS'` et la propriété `misses` n'existe pas.

- [ ] **Step 3: Modifier `src/domain/types.ts`**

Remplacer les lignes 18-30 par :

```ts
interface EventBase { id: string; wallClock: number; period: Period; gameClock: number }

/** Position d'un tir, normalisée dans le demi-terrain :
 *  x 0..1 de la touche gauche à la touche droite,
 *  y 0..1 de la ligne de fond à la ligne médiane. */
export interface ShotSpot { x: number; y: number }

export type GameEvent =
  | (EventBase & { type: 'STARTING_FIVE'; team: TeamSide; playerIds: string[] })
  | (EventBase & { type: 'PERIOD_START' })
  | (EventBase & { type: 'PERIOD_END' })
  | (EventBase & { type: 'CLOCK_START' })
  | (EventBase & { type: 'CLOCK_STOP' })
  // playerId absent = panier d'équipe sans joueur identifié (score adverse en mode solo).
  // shot absent = tir saisi sans position (lancer franc, ou match antérieur à la carte de tir).
  | (EventBase & { type: 'SCORE'; team: TeamSide; playerId?: string; kind: ScoreKind; shot?: ShotSpot })
  | (EventBase & { type: 'MISS'; team: TeamSide; playerId: string; kind: ScoreKind; shot: ShotSpot })
  | (EventBase & { type: 'FOUL'; team: TeamSide; target: FoulTarget; foulType: FoulType })
  | (EventBase & { type: 'TIMEOUT'; team: TeamSide })
  | (EventBase & { type: 'SUBSTITUTION'; team: TeamSide; playerInId: string; playerOutId: string })
  | (EventBase & { type: 'STAT'; team: TeamSide; playerId: string; stat: StatKind })
```

Dans `MatchMeta`, ajouter après `teamAId: string; teamBId: string` :

```ts
  /** Mode « une seule équipe » : seul le côté A est détaillé joueur par joueur,
   *  le score adverse est saisi globalement. */
  solo?: true
```

- [ ] **Step 4: Modifier `src/domain/boxscore.ts`**

Ajouter `misses: number` à l'interface `PlayerStat` après `fouls: number` :

```ts
  fouls: number
  /** Tirs de champ manqués. Les lancers francs n'ont pas de position et n'entrent pas ici. */
  misses: number
```

Ajouter `misses: 0,` dans l'objet d'initialisation (`stats.set(id, { ... })`), après `fouls: 0,`.

Remplacer le bloc `SCORE` de la boucle (lignes 40-47) par :

```ts
    if (e.type === 'SCORE' && e.team === side) {
      if (!e.playerId) continue // panier d'équipe : compté au score, dans la ligne d'aucun joueur
      const s = stats.get(e.playerId); if (!s) continue
      s.points += pointsForKind(e.kind)
      if (e.kind === '3') { s.threes++; s.fieldGoalsMade++ }
      else if (e.kind === '2int') { s.twoInside++; s.fieldGoalsMade++ }
      else if (e.kind === '2ext') { s.twoOutside++; s.fieldGoalsMade++ }
      else s.freeThrows++
    }
    if (e.type === 'MISS' && e.team === side) {
      const s = stats.get(e.playerId); if (s) s.misses++
    }
```

- [ ] **Step 5: Lancer toute la suite**

Run: `pnpm test`
Expected: PASS. Si `src/test/reference.test.ts` ou `PrintableSummary.test.tsx` échouent sur un objet `PlayerStat` littéral, y ajouter `misses: 0`.

- [ ] **Step 6: Vérifier la compilation**

Run: `pnpm build`
Expected: succès. Toute erreur `'playerId' is possibly 'undefined'` signale un endroit oublié : ajouter un garde `if (!e.playerId) continue`, jamais un `!`.

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/boxscore.ts src/domain/boxscore.test.ts src/rules/ffbb.test.ts
git commit -m "feat(domain): position de tir, évènement MISS et panier d'équipe sans joueur"
```

---

### Task 3 : Agrégation des tirs

**Files:**
- Create: `src/domain/shotchart.ts`
- Test: `src/domain/shotchart.test.ts`

**Interfaces:**
- Consumes: `zoneAt`, `isThree`, `ZONES`, `ShotZone` (Task 1) ; `ShotSpot`, `Match` (Task 2).
- Produces: `interface Shot { matchId: string; spot: ShotSpot; zone: ShotZone; made: boolean }`, `interface ZoneTally { made: number; attempts: number }`, `shotsOf(matches: Match[], playerId: string): Shot[]`, `zoneSummary(shots: Shot[]): Record<ShotZone, ZoneTally>`, `shootingPct(shots: Shot[]): { fg: number | null; three: number | null }`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/domain/shotchart.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { shootingPct, shotsOf, zoneSummary } from './shotchart'
import type { GameEvent, Match } from './types'

const mk = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'x', teamAId: 'a', teamBId: 'b' },
  roster: { A: ['p1', 'p2'], B: [] }, status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

const TOP3 = { x: 0.5, y: 0.65 }
const PAINT = { x: 0.5, y: 0.15 }

describe('shotsOf', () => {
  it('rassemble les tirs d’un joueur sur plusieurs matchs', () => {
    const shots = shotsOf([
      mk('m1', [{ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 }]),
      mk('m2', [{ type: 'MISS', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT }]),
    ], 'p1')
    expect(shots).toHaveLength(2)
    expect(shots.map((s) => s.zone)).toEqual(['top3', 'paint'])
    expect(shots.map((s) => s.made)).toEqual([true, false])
    expect(shots.map((s) => s.matchId)).toEqual(['m1', 'm2'])
  })

  it('exclut les tirs des autres joueurs', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p2', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })

  it('exclut les lancers francs et les paniers sans position', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: 'lf' },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int' }, // raccourci sans position
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    ])
    expect(shotsOf([m], 'p1')).toHaveLength(1)
  })
})

describe('zoneSummary', () => {
  it('cumule réussis et tentatives par zone, à zéro partout ailleurs', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    const sum = zoneSummary(shotsOf([m], 'p1'))
    expect(sum.top3).toEqual({ made: 1, attempts: 2 })
    expect(sum.paint).toEqual({ made: 1, attempts: 1 })
    expect(sum.corner3_left).toEqual({ made: 0, attempts: 0 })
  })
})

describe('shootingPct', () => {
  it('calcule la réussite globale et à 3 points', () => {
    const m = mk('m1', [
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', shot: PAINT },
    ])
    expect(shootingPct(shotsOf([m], 'p1'))).toEqual({ fg: 75, three: 50 })
  })

  it('renvoie null plutôt que zéro quand il n’y a aucun tir', () => {
    expect(shootingPct([])).toEqual({ fg: null, three: null })
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/domain/shotchart.test.ts`
Expected: FAIL — `Failed to resolve import "./shotchart"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/domain/shotchart.ts` :

```ts
import { isThree, zoneAt, ZONES, type ShotZone } from './shotzones'
import type { Match, ShotSpot } from './types'

export interface Shot { matchId: string; spot: ShotSpot; zone: ShotZone; made: boolean }
export interface ZoneTally { made: number; attempts: number }

/**
 * Tirs positionnés d'un joueur. Un seul match en entrée donne la hot zone du
 * match, tous ses matchs donnent celle de sa carrière : même fonction.
 * Les lancers francs et les paniers saisis sans position sont exclus — ils
 * n'ont pas de coordonnée et fausseraient les pourcentages par zone.
 */
export function shotsOf(matches: Match[], playerId: string): Shot[] {
  const out: Shot[] = []
  for (const m of matches)
    for (const e of m.events) {
      if (e.type === 'SCORE' && e.playerId === playerId && e.shot)
        out.push({ matchId: m.id, spot: e.shot, zone: zoneAt(e.shot.x, e.shot.y), made: true })
      else if (e.type === 'MISS' && e.playerId === playerId)
        out.push({ matchId: m.id, spot: e.shot, zone: zoneAt(e.shot.x, e.shot.y), made: false })
    }
  return out
}

export function zoneSummary(shots: Shot[]): Record<ShotZone, ZoneTally> {
  const acc = Object.fromEntries(ZONES.map((z) => [z, { made: 0, attempts: 0 }])) as Record<ShotZone, ZoneTally>
  for (const s of shots) {
    acc[s.zone].attempts++
    if (s.made) acc[s.zone].made++
  }
  return acc
}

/** Réussite en pourcentage entier. `null` quand il n'y a aucun tir : afficher
 *  « 0 % » à un joueur qui n'a pas tiré serait faux. */
export function shootingPct(shots: Shot[]): { fg: number | null; three: number | null } {
  const pct = (s: Shot[]) => (s.length ? Math.round((s.filter((x) => x.made).length / s.length) * 100) : null)
  return { fg: pct(shots), three: pct(shots.filter((s) => isThree(s.zone))) }
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm test src/domain/shotchart.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/shotchart.ts src/domain/shotchart.test.ts
git commit -m "feat(domain): agrégation des tirs par zone et pourcentages de réussite"
```

---

### Task 4 : Composant terrain — tracés, saisie, carte de chaleur

**Files:**
- Create: `src/ui/components/ShotCourt.tsx`
- Test: `src/ui/components/ShotCourt.test.tsx`

**Interfaces:**
- Consumes: `ShotZone`, `ZONES`, `ZONE_LABELS`, `ZONE_CENTROID`, `kindAt` (Task 1) ; `Shot`, `zoneSummary` (Task 3) ; `ShotSpot` (Task 2).
- Produces: `ShotPicker({ onPick }: { onPick: (spot: ShotSpot) => void })`, `ShotChart({ shots, minAttempts }: { shots: Shot[]; minAttempts?: number })`.

Repères de la `viewBox` `0 0 1500 1400`, en centimètres, ligne de fond en haut :
panier `(750, 157,5)` · raquette `x 505→995, y 0→580` · lignes de corner `x = 90` et `x = 1410`
jusqu'à `y = 299,01` · arc de rayon `675` · sommet de l'arc `y = 832,5` · arc au droit
des lignes de raquette `y = 786,5`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/ui/components/ShotCourt.test.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShotChart, ShotPicker } from './ShotCourt'
import type { Shot } from '../../domain/shotchart'

beforeEach(() => {
  // jsdom ne calcule pas de mise en page : on fixe la boîte du SVG à 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

describe('ShotPicker', () => {
  it('convertit un clic en coordonnées normalisées', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(onPick).toHaveBeenCalledTimes(1)
    const spot = onPick.mock.calls[0][0]
    expect(spot.x).toBeCloseTo(0.5, 2)
    expect(spot.y).toBeCloseTo(0.1, 2)
  })

  it('borne un clic débordant dans les limites du terrain', () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 400, clientY: -20 })
    expect(onPick.mock.calls[0][0]).toEqual({ x: 1, y: 0 })
  })

  it('offre un bouton par zone pour la saisie au clavier', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).toHaveBeenCalledWith({ x: 0.03, y: 0.12 })
  })
})

describe('ShotChart', () => {
  const shot = (zoneY: number, made: boolean): Shot => ({
    matchId: 'm1', spot: { x: 0.5, y: zoneY }, zone: zoneY > 0.6 ? 'top3' : 'paint', made,
  })

  it('affiche le ratio des zones ayant assez de tentatives', () => {
    render(<ShotChart shots={[shot(0.15, true), shot(0.15, true), shot(0.15, false)]} />)
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('masque le ratio des zones sous le seuil de tentatives', () => {
    render(<ShotChart shots={[shot(0.15, true)]} />)
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })

  it('trace un point par tir', () => {
    const { container } = render(<ShotChart shots={[shot(0.15, true), shot(0.65, false)]} />)
    expect(container.querySelectorAll('[data-shot]')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/components/ShotCourt.test.tsx`
Expected: FAIL — `Failed to resolve import "./ShotCourt"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/ui/components/ShotCourt.tsx` :

```tsx
import type { ReactNode } from 'react'
import { zoneSummary, type Shot } from '../../domain/shotchart'
import { ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
import type { ShotSpot } from '../../domain/types'
import { C } from '../olive/kit'

// viewBox en centimètres, ligne de fond en haut. Voir les repères du plan.
const W = 1500
const D = 1400

/** Contours des zones, dans le même ordre que ZONES. Les arcs suivent la ligne à 3 points. */
const ZONE_PATH: Record<ShotZone, string> = {
  paint: 'M 505 0 H 995 V 580 H 505 Z',
  mid_left: 'M 90 0 H 505 V 786.5 A 675 675 0 0 1 90 299.01 Z',
  mid_center: 'M 505 580 H 995 V 786.5 A 675 675 0 0 1 505 786.5 Z',
  mid_right: 'M 1410 0 H 995 V 786.5 A 675 675 0 0 0 1410 299.01 Z',
  corner3_left: 'M 0 0 H 90 V 299.01 H 0 Z',
  corner3_right: 'M 1410 0 H 1500 V 299.01 H 1410 Z',
  top3: 'M 0 299.01 H 90 A 675 675 0 0 0 1410 299.01 H 1500 V 1400 H 0 Z',
}

/** Tracés réglementaires, sans interaction ni données. */
function CourtLines() {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 8, opacity: 0.45 } as const
  return (
    <g style={{ color: C.muted }}>
      <rect x={4} y={4} width={W - 8} height={D - 8} rx={12} {...line} />
      <rect x={505} y={0} width={490} height={580} {...line} />
      <circle cx={750} cy={580} r={180} {...line} />
      <line x1={660} y1={120} x2={840} y2={120} {...line} />
      <circle cx={750} cy={157.5} r={22.5} {...line} />
      <path d="M 90 0 L 90 299.01 A 675 675 0 0 0 1410 299.01 L 1410 0" {...line} />
    </g>
  )
}

function Court({ children, label, onClick }: { children: ReactNode; label: string; onClick?: (e: React.MouseEvent<SVGSVGElement>) => void }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${D}`}
      role={onClick ? 'application' : 'img'}
      aria-label={label}
      onClick={onClick}
      className={`w-full rounded-2xl ${onClick ? 'cursor-crosshair' : ''}`}
      style={{ background: C.panel, border: `1px solid ${C.border}`, touchAction: 'manipulation' }}
    >
      {children}
    </svg>
  )
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Terrain de saisie. Le clic est converti en coordonnées normalisées à partir de
 * la boîte rendue, donc indépendamment de la taille d'affichage.
 * Les sept boutons sous le terrain donnent le même résultat au clavier, à la
 * précision de la zone près.
 */
export function ShotPicker({ onPick }: { onPick: (spot: ShotSpot) => void }) {
  const pickFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    onPick({ x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) })
  }
  return (
    <div>
      <Court label="Demi-terrain — toucher le point de tir" onClick={pickFromEvent}>
        <CourtLines />
      </Court>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ZONES.map((z) => (
          <button
            key={z}
            onClick={() => onPick(ZONE_CENTROID[z])}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-125"
            style={{ background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {ZONE_LABELS[z]}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Carte de chaleur. Une zone reste neutre sous `minAttempts` tentatives :
 * afficher « 100 % » sur un seul tir donnerait une lecture fausse.
 */
export function ShotChart({ shots, minAttempts = 3 }: { shots: Shot[]; minAttempts?: number }) {
  const sum = zoneSummary(shots)
  return (
    <Court label="Carte des tirs">
      {ZONES.map((z) => {
        const { made, attempts } = sum[z]
        const enough = attempts >= minAttempts
        const pct = attempts ? made / attempts : 0
        return (
          <path
            key={z}
            d={ZONE_PATH[z]}
            fill={enough ? C.accent : C.text}
            fillOpacity={enough ? 0.1 + 0.55 * pct : 0.03}
          />
        )
      })}
      <CourtLines />
      {shots.map((s, i) => (
        <circle
          key={i}
          data-shot={s.made ? 'made' : 'missed'}
          cx={s.spot.x * W}
          cy={s.spot.y * D}
          r={14}
          fill={s.made ? C.accent : 'none'}
          stroke={s.made ? 'none' : C.muted}
          strokeWidth={6}
        />
      ))}
      {ZONES.map((z) => {
        const { made, attempts } = sum[z]
        if (attempts < minAttempts) return null
        return (
          <text
            key={z}
            x={ZONE_CENTROID[z].x * W}
            y={ZONE_CENTROID[z].y * D}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={62}
            fontWeight={900}
            fill={C.text}
          >
            {made}/{attempts}
          </text>
        )
      })}
    </Court>
  )
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm test src/ui/components/ShotCourt.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/ShotCourt.tsx src/ui/components/ShotCourt.test.tsx
git commit -m "feat(ui): demi-terrain SVG — saisie du point de tir et carte de chaleur"
```

---

### Task 5 : Saisie du tir dans la popup joueur

**Files:**
- Modify: `src/ui/components/PlayerActionDialog.tsx` (réécriture des blocs POINTS et CORRECTIONS), `src/ui/components/TeamPanel.tsx:82-87`, `src/ui/screens/LiveMatch.tsx:182-220,304-314`, `src/ui/screens/SummaryScreen.tsx:76-92,115-127`
- Test: `src/ui/screens/LiveMatch.test.tsx`

**Interfaces:**
- Consumes: `ShotPicker` (Task 4), `kindAt` (Task 1), `ShotSpot` (Task 2).
- Produces: nouvelle signature de `PlayerActionDialog` — `onScore: (kind: ScoreKind, shot?: ShotSpot) => void`, `onMiss: (kind: ScoreKind, shot: ShotSpot) => void`, `misses?: number`, `onRemoveMiss: () => void`. Les props `scoreCounts`, `statCounts`, `fouls`, `onFoul`, `onStat`, `onRemoveScore`, `onRemoveFoul`, `onRemoveStat`, `onClose`, `open`, `playerName`, `color` sont inchangées.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `src/ui/screens/LiveMatch.test.tsx` (reprendre le `beforeEach` et les helpers déjà présents en tête du fichier, qui montent un match avec cinq de départ et chrono démarré) :

```tsx
it('enregistre un 3 points avec sa position depuis le terrain', async () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  renderLive()
  await userEvent.click(await screen.findByRole('button', { name: /4 / }))
  // Aile / axe à 3 points : y ≈ 0,65 → 3 points.
  await userEvent.click(screen.getByRole('button', { name: 'Aile / axe à 3 pts' }))
  const saved = await getMatch(MATCH_ID)
  const scored = saved!.events.filter((e) => e.type === 'SCORE')
  expect(scored).toHaveLength(1)
  expect(scored[0]).toMatchObject({ kind: '3', shot: { x: 0.5, y: 0.68 } })
})

it('enregistre un tir manqué sans changer le score', async () => {
  renderLive()
  await userEvent.click(await screen.findByRole('button', { name: /4 / }))
  await userEvent.click(screen.getByRole('button', { name: 'Manqué' }))
  await userEvent.click(screen.getByRole('button', { name: 'Raquette' }))
  const saved = await getMatch(MATCH_ID)
  expect(saved!.events.filter((e) => e.type === 'MISS')).toHaveLength(1)
  expect(saved!.events.filter((e) => e.type === 'SCORE')).toHaveLength(0)
})
```

> `renderLive`, `MATCH_ID` et l'import de `getMatch` doivent reprendre exactement ce que le fichier de test existant utilise déjà. Si le fichier ne fournit pas de helper `renderLive`, extraire le corps du premier `it` en helper avant d'ajouter ces cas.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/screens/LiveMatch.test.tsx`
Expected: FAIL — aucun bouton nommé « Aile / axe à 3 pts ».

- [ ] **Step 3: Réécrire `PlayerActionDialog`**

Remplacer intégralement `src/ui/components/PlayerActionDialog.tsx` :

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker } from './ShotCourt'
import { kindAt } from '../../domain/shotzones'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'

const SCORES: { k: ScoreKind; label: string; pts: number }[] = [
  { k: '2int', label: '2 pts intérieur', pts: 2 },
  { k: '2ext', label: '2 pts extérieur', pts: 2 },
  { k: '3', label: '3 points', pts: 3 },
  { k: 'lf', label: 'Lancer franc', pts: 1 },
]
const STATS: { k: StatKind; label: string }[] = [
  { k: 'assist', label: 'Passe déc.' },
  { k: 'block', label: 'Contre' },
  { k: 'reb_off', label: 'Rebond off.' },
  { k: 'reb_def', label: 'Rebond déf.' },
]
const ZERO_S: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
const ZERO_T: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }

export function PlayerActionDialog({
  open, playerName, color = '#ffffff', scoreCounts, statCounts, fouls = 0, misses = 0,
  onClose, onScore, onMiss, onFoul, onStat, onRemoveScore, onRemoveFoul, onRemoveStat, onRemoveMiss,
}: {
  open: boolean; playerName: string; color?: string
  scoreCounts?: Record<ScoreKind, number>; statCounts?: Record<StatKind, number>
  fouls?: number; misses?: number
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onRemoveScore: (kind: ScoreKind) => void; onRemoveFoul: () => void
  onRemoveStat: (kind: StatKind) => void; onRemoveMiss: () => void
}) {
  const [made, setMade] = useState(true)
  const sc = scoreCounts ?? ZERO_S
  const tc = statCounts ?? ZERO_T
  const hasCorrections =
    Object.values(sc).some((n) => n > 0) || Object.values(tc).some((n) => n > 0) || fouls > 0 || misses > 0

  // Le mode revient à « Réussi » à chaque ouverture : c'est le cas courant.
  const close = () => { setMade(true); onClose() }

  const pick = (spot: ShotSpot) => {
    const kind = kindAt(spot.x, spot.y)
    if (made) onScore(kind, spot); else onMiss(kind, spot)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md border-none bg-[#161618] p-5 text-white [&>button]:text-white/60 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/20" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>

        {/* TIR : réussi ou manqué, puis position sur le terrain */}
        <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-[#202024] p-1">
          <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[#ff4d6d] text-white">Réussi</Toggle>
          <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-white/20 text-white">Manqué</Toggle>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-white/45">
          {made ? 'Touchez l’endroit du tir : la zone donne les points.' : 'Touchez l’endroit du tir manqué.'}
        </p>
        <div className="mt-2"><ShotPicker onPick={pick} /></div>

        <button onClick={() => { onScore('lf'); close() }}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-[#202024] py-3 text-sm font-bold text-white transition hover:border-[#ff4d6d] active:scale-[0.98]">
          + 1 Lancer franc
        </button>

        {/* AUTRES STATS */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {STATS.map((s) => (
            <button key={s.k} onClick={() => { onStat(s.k); close() }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#202024] px-3.5 py-2.5 text-left transition hover:border-[#3fe08a] hover:bg-[#26262b] active:scale-[0.97]">
              <span className="text-[13px] font-semibold text-white/80">{s.label}</span>
              <span className="text-base font-black text-[#3fe08a]">+1</span>
            </button>
          ))}
        </div>

        <button onClick={() => { onFoul('personal'); close() }}
          className="mt-3 w-full rounded-2xl bg-red-500/15 py-3.5 text-base font-bold text-red-400 transition hover:bg-red-500 hover:text-white active:scale-[0.98]">
          ⚠ Faute personnelle
        </button>

        {/* CORRECTIONS */}
        {hasCorrections && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/40">Corriger — retirer une action</p>
            <div className="grid grid-cols-2 gap-2">
              {SCORES.map((s) => (
                <RemoveBtn key={s.k} label={s.label} value={`−${s.pts}`} disabled={sc[s.k] <= 0} onClick={() => { onRemoveScore(s.k); close() }} />
              ))}
              {STATS.map((s) => (
                <RemoveBtn key={s.k} label={s.label} value="−1" disabled={tc[s.k] <= 0} onClick={() => { onRemoveStat(s.k); close() }} />
              ))}
            </div>
            <button disabled={misses <= 0} onClick={() => { onRemoveMiss(); close() }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#202024] py-2.5 text-sm font-bold text-white/80 transition hover:border-white/25 hover:bg-[#26262b] disabled:opacity-35 disabled:hover:border-white/10">
              − Retirer le dernier tir manqué {misses > 0 && <span className="text-white/40">({misses})</span>}
            </button>
            <button disabled={fouls <= 0} onClick={() => { onRemoveFoul(); close() }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#202024] py-2.5 text-sm font-bold text-white/80 transition hover:border-white/25 hover:bg-[#26262b] disabled:opacity-35 disabled:hover:border-white/10">
              − Retirer une faute {fouls > 0 && <span className="text-white/40">({fouls})</span>}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Toggle({ active, activeClass, onClick, children }: { active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`rounded-lg py-2 text-sm font-bold transition ${active ? activeClass : 'text-white/50 hover:text-white/80'}`}>
      {children}
    </button>
  )
}

function RemoveBtn({ label, value, disabled, onClick }: { label: string; value: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="flex items-center justify-between gap-1 rounded-xl border border-white/10 bg-[#202024] px-3 py-2 text-left transition hover:border-white/25 hover:bg-[#26262b] active:scale-[0.97] disabled:opacity-35 disabled:hover:border-white/10">
      <span className="truncate text-[12px] font-semibold text-white/70">{label}</span>
      <span className="tabular-nums text-sm font-black text-white/80">{value}</span>
    </button>
  )
}
```

- [ ] **Step 4: Retirer les raccourcis +2 / +3 de `TeamPanel`**

Dans `src/ui/components/TeamPanel.tsx`, remplacer la grille des lignes 82-87 par :

```tsx
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Quick disabled={out} label="+1" onClick={() => onScore(p.id, 'lf')} />
                <Quick disabled={out} label="F" foul onClick={() => onFoul(p.id)} />
              </div>
```

Le commentaire de tête du composant (lignes 5-6) devient :

```tsx
/** Colonne d'équipe : entête (fautes/bonus/TM), cartes joueurs avec raccourcis
 * lancer franc et faute ; tap sur le nom = dialogue avec la carte de tir. */
```

- [ ] **Step 5: Brancher `LiveMatch`**

Dans `src/ui/screens/LiveMatch.tsx` :

Ajouter aux imports :

```tsx
import type { Match, Period, Player, ScoreKind, StatKind, FoulType, TeamSide, ShotSpot } from '../../domain/types'
```

Après `quickStat` (ligne 187), ajouter :

```tsx
  const quickMiss = (side: TeamSide, playerId: string, kind: ScoreKind, shot: ShotSpot) =>
    dispatch({ type: 'MISS', team: side, playerId, kind, shot, period: ls.period, gameClock: seconds })
  const removeMiss = (side: TeamSide, playerId: string) =>
    removeLast((e) => e.type === 'MISS' && e.team === side && e.playerId === playerId)
  const missCount = (side: TeamSide, playerId: string) =>
    match.events.filter((e) => e.type === 'MISS' && e.team === side && e.playerId === playerId).length
```

Remplacer `score` (ligne 216) par :

```tsx
  const score = (kind: ScoreKind, shot?: ShotSpot) => pick &&
    dispatch({ type: 'SCORE', team: pick.side, playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
```

Dans le JSX de `<PlayerActionDialog>` (lignes 304-314), ajouter trois props après `fouls=…` :

```tsx
        misses={pick ? missCount(pick.side, pick.id) : 0}
        onMiss={(kind, shot) => pick && quickMiss(pick.side, pick.id, kind, shot)}
        onRemoveMiss={() => pick && removeMiss(pick.side, pick.id)}
```

- [ ] **Step 6: Brancher `SummaryScreen`**

Dans `src/ui/screens/SummaryScreen.tsx` :

Ajouter `ShotSpot` à l'import de types (ligne 20).

Après `addStat` (ligne 78), ajouter :

```tsx
  const addMiss = (side: TeamSide, playerId: string, kind: ScoreKind, shot: ShotSpot) => addEvent({ type: 'MISS', team: side, playerId, kind, shot, period: ls.period, gameClock: 0 })
  const removeMiss = (side: TeamSide, id: string) => removeLast((e) => e.type === 'MISS' && e.team === side && e.playerId === id)
  const missesOf = (side: TeamSide, id: string) => match.events.filter((e) => e.type === 'MISS' && e.team === side && e.playerId === id).length
```

Remplacer `addScore` (ligne 76) par :

```tsx
  const addScore = (side: TeamSide, playerId: string, kind: ScoreKind, shot?: ShotSpot) => addEvent({ type: 'SCORE', team: side, playerId, kind, shot, period: ls.period, gameClock: 0 })
```

Dans le JSX de `<PlayerActionDialog>` (lignes 115-127), remplacer la ligne `onScore=…` et ajouter deux props :

```tsx
        onScore={(k, shot) => pick && addScore(pick.side, pick.id, k, shot)}
        misses={pick ? missesOf(pick.side, pick.id) : 0}
        onMiss={(k, shot) => pick && addMiss(pick.side, pick.id, k, shot)}
        onRemoveMiss={() => pick && removeMiss(pick.side, pick.id)}
```

- [ ] **Step 7: Lancer toute la suite et le build**

Run: `pnpm test && pnpm build`
Expected: PASS et compilation réussie. Les tests existants qui cliquaient sur `+2` ou `+3` dans `TeamPanel` doivent être adaptés pour passer par la popup — ne pas réintroduire les boutons pour les faire passer.

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/PlayerActionDialog.tsx src/ui/components/TeamPanel.tsx src/ui/screens/LiveMatch.tsx src/ui/screens/SummaryScreen.tsx src/ui/screens/LiveMatch.test.tsx
git commit -m "feat(ui): saisie du tir par la position sur le terrain, tirs manqués inclus"
```

---

### Task 6 : Fiche joueur

**Files:**
- Create: `src/ui/screens/PlayerDetail.tsx`
- Modify: `src/App.tsx:1-71`, `src/ui/screens/TeamDetail.tsx:134-143`, `src/ui/screens/SummaryScreen.tsx:230-247`
- Test: `src/ui/screens/PlayerDetail.test.tsx`

**Interfaces:**
- Consumes: `shotsOf`, `shootingPct` (Task 3), `ShotChart` (Task 4), `playerStats` (Task 2), `getPlayer`/`listMatches`/`getTeam` (`persistence/repositories`).
- Produces: composant `PlayerDetail` monté sur `/players/:id`.

> Vérifier avant d'écrire que `src/persistence/repositories.ts` exporte bien `getPlayer`. Si ce n'est pas le cas, l'ajouter à côté de `getTeam` sur le même modèle : `export const getPlayer = (id: string) => db.players.get(id)`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/ui/screens/PlayerDetail.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlayerDetail } from './PlayerDetail'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }

const match = (id: string, events: Partial<GameEvent>[]): Match => ({
  id, meta: { championshipLabel: 'Poule A', date: '2026-01-10', teamAId: 'ta', teamBId: 'tb' },
  roster: { A: ['p1'], B: [] }, status: 'finished',
  events: events.map((e, i) => ({ id: `${id}-e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)),
})

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  await saveMatch(match('m1', [
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    { type: 'MISS', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
  ]))
})

const renderAt = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/players/${id}`]}>
      <Routes><Route path="/players/:id" element={<PlayerDetail />} /></Routes>
    </MemoryRouter>,
  )

describe('PlayerDetail', () => {
  it('affiche l’identité, les totaux et la réussite aux tirs', async () => {
    renderAt('p1')
    expect(await screen.findByText('MARTIN Lucas')).toBeInTheDocument()
    expect(await screen.findByText('67 %')).toBeInTheDocument() // 2 tirs sur 3
    expect(screen.getByText('6')).toBeInTheDocument() // points par match
  })

  it('liste les rencontres du joueur', async () => {
    renderAt('p1')
    await waitFor(() => expect(screen.getByText(/Poule A/)).toBeInTheDocument())
  })

  it('signale un joueur introuvable', async () => {
    renderAt('inconnu')
    expect(await screen.findByText(/introuvable/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/screens/PlayerDetail.test.tsx`
Expected: FAIL — `Failed to resolve import "./PlayerDetail"`.

- [ ] **Step 3: Écrire le composant**

Créer `src/ui/screens/PlayerDetail.tsx` :

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlayer, getTeam, listMatches } from '../../persistence/repositories'
import { refresh as refreshRemote } from '../../persistence/remote'
import { playerStats } from '../../domain/boxscore'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
import { C, bd, TeamBadge, champLabel, fmtDate } from '../olive/kit'
import type { Match, Player, Team } from '../../domain/types'

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const [player, setPlayer] = useState<Player | null | undefined>(undefined)
  const [team, setTeam] = useState<Team | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    refreshRemote()
      .then(() => getPlayer(id))
      .then(async (p) => {
        if (cancelled) return
        if (!p) { setPlayer(null); return }
        const [t, all] = await Promise.all([getTeam(p.teamId), listMatches()])
        if (cancelled) return
        setTeam(t ?? null)
        // Rencontres où le joueur figure à l'effectif et qui ont commencé.
        setMatches(all.filter((m) => m.status !== 'setup' && (m.roster.A.includes(id) || m.roster.B.includes(id))))
        setPlayer(p)
      })
    return () => { cancelled = true }
  }, [id])

  if (!id) return null
  if (player === undefined) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (player === null)
    return (
      <div className="p-6">
        <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
          Joueur introuvable. <Link to="/teams" className="font-bold" style={{ color: C.accent }}>← Équipes</Link>
        </p>
      </div>
    )

  const sideOf = (m: Match) => (m.roster.A.includes(id) ? 'A' : 'B') as 'A' | 'B'
  const lineOf = (m: Match) => playerStats(m, sideOf(m)).find((s) => s.playerId === id)
  const totalPoints = matches.reduce((n, m) => n + (lineOf(m)?.points ?? 0), 0)
  const career = shotsOf(matches, id)
  const pct = shootingPct(career)
  const played = matches.length
  const ordered = [...matches].sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))

  return (
    <div className="p-6">
      <Link to={team ? `/teams/${team.id}` : '/teams'} className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
        ← {team?.name ?? 'Équipes'}
      </Link>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <span className="nums grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold" style={{ background: C.accentBg, color: C.accent }}>
          {player.number}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{player.lastName} {player.firstName}</h1>
          {team && <p className="flex items-center gap-2 text-sm" style={{ color: C.muted }}><TeamBadge id={team.id} name={team.name} size="h-5 w-5 text-[8px]" />{team.name}</p>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rencontres" value={String(played)} hint="jouées" />
        <StatCard label="Points / match" value={played ? String(Math.round(totalPoints / played)) : '—'} hint={`${totalPoints} au total`} />
        <StatCard label="Réussite aux tirs" value={pct.fg === null ? '—' : `${pct.fg} %`} hint={`${career.length} tir${career.length > 1 ? 's' : ''} localisé${career.length > 1 ? 's' : ''}`} accent={C.accent} />
        <StatCard label="Réussite à 3 pts" value={pct.three === null ? '—' : `${pct.three} %`} hint="sur la carrière" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Panel title="Hot zone — carrière">
          {career.length === 0 ? (
            <Empty>Aucun tir localisé pour l’instant.</Empty>
          ) : (
            <ShotChart shots={career} />
          )}
        </Panel>

        <Panel title="Rencontres">
          {ordered.length === 0 ? (
            <Empty>Aucune rencontre jouée.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((m) => {
                const s = lineOf(m)
                const shots = shotsOf([m], id)
                const isOpen = openMatch === m.id
                return (
                  <li key={m.id} className="rounded-xl" style={{ background: C.panel }}>
                    <button onClick={() => setOpenMatch(isOpen ? null : m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{champLabel(m.meta)}</span>
                      <span className="shrink-0 text-[11px] font-semibold" style={{ color: C.faint }}>{fmtDate(m.meta.date).long || '—'}</span>
                      <span className="nums w-14 shrink-0 text-right text-sm font-black">{s?.points ?? 0} pts</span>
                      <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3" style={{ borderColor: C.border }}>
                        <p className="mb-2 text-[11px] font-semibold" style={{ color: C.muted }}>
                          {s?.fieldGoalsMade ?? 0} tir{(s?.fieldGoalsMade ?? 0) > 1 ? 's' : ''} réussi{(s?.fieldGoalsMade ?? 0) > 1 ? 's' : ''} ·
                          {' '}{s?.misses ?? 0} manqué{(s?.misses ?? 0) > 1 ? 's' : ''} · {s?.fouls ?? 0} faute{(s?.fouls ?? 0) > 1 ? 's' : ''}
                        </p>
                        {shots.length === 0 ? <Empty>Aucun tir localisé sur cette rencontre.</Empty> : <ShotChart shots={shots} minAttempts={1} />}
                        <Link to={`/match/${m.id}/summary`} className="mt-2 inline-block text-xs font-bold" style={{ color: C.accent }}>
                          Voir la feuille de match →
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
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
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
```

- [ ] **Step 4: Déclarer la route**

Dans `src/App.tsx`, ajouter l'import puis la route dans le bloc `OliveShell`, juste après `/teams/:id` :

```tsx
import { PlayerDetail } from './ui/screens/PlayerDetail'
```

```tsx
          <Route path="/players/:id" element={<PlayerDetail />} />
```

- [ ] **Step 5: Ajouter les liens entrants**

Dans `src/ui/screens/TeamDetail.tsx`, remplacer le `<li>` de l'effectif (lignes 136-141) par :

```tsx
                <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <Link to={`/players/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                    <span className="font-semibold">{p.lastName}</span><span style={{ color: C.muted }}>{p.firstName}</span>
                  </Link>
                  <button onClick={() => removePlayer(p.id)} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold" style={{ color: C.pink }}>retirer</button>
                </li>
```

Dans `src/ui/screens/SummaryScreen.tsx`, rendre le nom cliquable dans `TeamTable` (ligne 238) :

```tsx
                  <Td left>{p ? <Link to={`/players/${s.playerId}`} className="hover:underline">{p.lastName} {p.firstName}</Link> : s.playerId}</Td>
```

- [ ] **Step 6: Lancer les tests et le build**

Run: `pnpm test && pnpm build`
Expected: PASS et compilation réussie.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/PlayerDetail.tsx src/ui/screens/PlayerDetail.test.tsx src/App.tsx src/ui/screens/TeamDetail.tsx src/ui/screens/SummaryScreen.tsx
git commit -m "feat(ui): fiche joueur avec hot zone carrière et détail par rencontre"
```

---

### Task 7 : Création d'un match en mode « une seule équipe »

**Files:**
- Modify: `src/ui/screens/MatchSetup.tsx:22-32,85-90`, `src/ui/components/StartingFiveGate.tsx:22-41`
- Test: `src/ui/screens/MatchSetup.test.tsx`

**Interfaces:**
- Consumes: `MatchMeta.solo` (Task 2).
- Produces: des matchs dont `meta.solo === true` et `roster.B === []`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `src/ui/screens/MatchSetup.test.tsx` :

```tsx
it('crée un match solo sans effectif adverse', async () => {
  const onCreated = vi.fn()
  render(<AdminProvider><MemoryRouter><MatchSetup onCreated={onCreated} /></MemoryRouter></AdminProvider>)
  await userEvent.click(await screen.findByLabelText('Je ne détaille que mon équipe'))
  await userEvent.click(screen.getByRole('button', { name: /Planifier la rencontre/ }))
  await waitFor(() => expect(onCreated).toHaveBeenCalled())
  const created = await db.matches.get(onCreated.mock.calls[0][0])
  expect(created!.meta.solo).toBe(true)
  expect(created!.roster.A).toHaveLength(1)
  expect(created!.roster.B).toEqual([])
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/screens/MatchSetup.test.tsx`
Expected: FAIL — aucun élément nommé « Je ne détaille que mon équipe ».

- [ ] **Step 3: Modifier `MatchSetup`**

Ajouter un état après la ligne 19 :

```tsx
  const [solo, setSolo] = useState(false)
```

Remplacer la fonction `create` (lignes 22-32) par :

```tsx
  const create = async () => {
    // En mode solo l'effectif adverse n'est pas chargé : rien n'y sera saisi.
    const [pa, pb] = await Promise.all([listPlayers(teamAId), solo ? Promise.resolve([]) : listPlayers(teamBId)])
    const match: Match = {
      id: newId(),
      meta: {
        championshipLabel: championshipLabel.trim() || undefined, matchNumber: matchNumber.trim() || undefined,
        venue: venue.trim() || undefined, date: date || undefined, time: time || undefined,
        teamAId, teamBId,
        coachA: teams?.find((t) => t.id === teamAId)?.coach,
        coachB: solo ? undefined : teams?.find((t) => t.id === teamBId)?.coach,
        ...(solo ? { solo: true as const } : {}),
      },
      roster: { A: pa.map((p) => p.id), B: pb.map((p) => p.id) }, events: [], status: 'setup',
    }
    await saveMatch(match)
    publishBundle({ match, players: [...pa, ...pb], teamNames: { A: nameOf(teamAId), B: nameOf(teamBId) } })
    onCreated(match.id)
  }
```

Après le bloc des deux `Picker` (ligne 88), ajouter :

```tsx
        <label htmlFor="solo" className="flex cursor-pointer items-start gap-3 rounded-xl p-3" style={{ background: C.panel, border: bd }}>
          <input id="solo" type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff4d6d]" />
          <span>
            <span className="block text-sm font-bold">Je ne détaille que mon équipe</span>
            <span className="block text-[12px]" style={{ color: C.muted }}>
              L’équipe A est saisie joueur par joueur ; le score adverse se saisit globalement. Le match compte normalement au classement.
            </span>
          </span>
        </label>
```

Remplacer le libellé du sélecteur A (ligne 86) pour qu'il reflète le mode :

```tsx
          <Picker id="ta" label={solo ? 'Mon équipe' : 'Équipe A · locaux'} teams={teams} value={teamAId} onChange={setA} />
```

- [ ] **Step 4: Rendre `StartingFiveGate` mono-colonne**

Dans `src/ui/components/StartingFiveGate.tsx`, remplacer les lignes 31-40 par :

```tsx
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Cinq de départ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {requiredB === 0 ? 'Désignez vos titulaires pour démarrer.' : 'Désignez les titulaires de chaque équipe pour démarrer.'}
          </p>
        </div>

        <div className={`grid gap-5 ${requiredB === 0 ? 'mx-auto max-w-md' : 'sm:grid-cols-2'}`}>
          <StartingFivePanel title={requiredB === 0 ? 'MON ÉQUIPE' : 'LOCAUX'} color={TEAM_A} players={rosterA} required={requiredA}
            chosen={selected.A} onToggle={(id) => onToggle('A', id)} />
          {requiredB > 0 && (
            <StartingFivePanel title="VISITEURS" color={TEAM_B} players={rosterB} required={requiredB}
              chosen={selected.B} onToggle={(id) => onToggle('B', id)} />
          )}
        </div>
```

- [ ] **Step 5: Lancer les tests et le build**

Run: `pnpm test && pnpm build`
Expected: PASS et compilation réussie.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/MatchSetup.tsx src/ui/screens/MatchSetup.test.tsx src/ui/components/StartingFiveGate.tsx
git commit -m "feat(match-setup): mode « une seule équipe » à la création de la rencontre"
```

---

### Task 8 : Écran live du mode solo

**Files:**
- Create: `src/ui/components/Scoreboard.tsx`, `src/ui/screens/SoloLiveMatch.tsx`, `src/ui/screens/LiveRouter.tsx`
- Modify: `src/ui/screens/LiveMatch.tsx:32-61,331-373`, `src/App.tsx:28-33,56`
- Test: `src/ui/screens/SoloLiveMatch.test.tsx`

**Interfaces:**
- Consumes: `useMatch`, `liveState`, `playerStats`, `TeamPanel`, `PlayerActionDialog`, `StartingFiveGate`, `SubstitutionDialog`, `ClockEditDialog`, `ConfirmDialog`, `GameClock`, `MatchMeta.solo`.
- Produces: `Scoreboard.tsx` exportant `PeriodStrip`, `ScoreSide`, `ClockAdjust`, `SbButton` ; `SoloLiveMatch({ matchId, onFinish })` ; `LiveRouter({ matchId, onFinish })`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/ui/screens/SoloLiveMatch.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SoloLiveMatch } from './SoloLiveMatch'
import { AdminProvider } from '../../app/admin'
import { db } from '../../persistence/db'
import { getMatch, saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { Match } from '../../domain/types'

const MATCH_ID = 'solo-1'

beforeEach(async () => {
  sessionStorage.setItem('admin-unlocked', '1')
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 4, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID,
    meta: { teamAId: 'ta', teamBId: 'tb', solo: true },
    roster: { A: ['p1'], B: [] },
    status: 'live',
    events: [
      { id: 'e0', wallClock: 0, period: 1, gameClock: 600, type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { id: 'e1', wallClock: 1, period: 1, gameClock: 600, type: 'CLOCK_START' },
    ],
  }
  await saveMatch(m)
})

const renderSolo = () =>
  render(<AdminProvider><MemoryRouter><SoloLiveMatch matchId={MATCH_ID} onFinish={vi.fn()} /></MemoryRouter></AdminProvider>)

describe('SoloLiveMatch', () => {
  it('n’affiche qu’une colonne d’équipe', async () => {
    renderSolo()
    expect(await screen.findByText('MARTIN')).toBeInTheDocument()
    expect(screen.queryByText('VISITEURS')).not.toBeInTheDocument()
  })

  it('ajoute un panier adverse sans joueur identifié', async () => {
    renderSolo()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 3 points à VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      const opp = saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')
      expect(opp).toHaveLength(1)
      expect(opp[0]).toMatchObject({ kind: '3' })
      expect((opp[0] as { playerId?: string }).playerId).toBeUndefined()
    })
  })

  it('retire le dernier panier adverse', async () => {
    renderSolo()
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter 2 points à VERDUN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le dernier panier de VERDUN' }))
    await waitFor(async () => {
      const saved = await getMatch(MATCH_ID)
      expect(saved!.events.filter((e) => e.type === 'SCORE' && e.team === 'B')).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/screens/SoloLiveMatch.test.tsx`
Expected: FAIL — `Failed to resolve import "./SoloLiveMatch"`.

- [ ] **Step 3: Extraire les éléments de scoreboard partagés**

Créer `src/ui/components/Scoreboard.tsx` avec le contenu exact des quatre helpers actuellement en bas de `src/ui/screens/LiveMatch.tsx` (`PeriodStrip` lignes 33-61, `ScoreSide` lignes 331-348, `ClockAdjust` lignes 350-359, `SbButton` lignes 361-373), en les exportant :

```tsx
import type { ReactNode } from 'react'
import type { Period } from '../../domain/types'

/** Frise des périodes façon « date strip » : Q1→Q4 puis prolongations, courante en surbrillance. */
export function PeriodStrip({ current }: { current: Period }) {
  const otCount = Math.max(0, current - 4)
  const chips: { period: Period; label: string }[] = [
    ...[1, 2, 3, 4].map((p) => ({ period: p as Period, label: `Q${p}` })),
    ...Array.from({ length: otCount }, (_, i) => ({ period: (5 + i) as Period, label: `P${i + 1}` })),
  ]
  return (
    <div className="flex items-center gap-1.5">
      {chips.map(({ period, label }) => {
        const isCurrent = period === current
        const isPast = period < current
        return (
          <span key={period}
            className={`nums rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
              isCurrent ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : isPast ? 'bg-white/10 text-white/70' : 'bg-white/[0.04] text-white/35'}`}>
            {label}
          </span>
        )
      })}
    </div>
  )
}

export function ScoreSide({ align, color, name, score, lead }: {
  align: 'left' | 'right'; color: string; name: string; score: number; lead: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ background: color }} />
        <span className="truncate text-[11px] font-bold text-white/85 sm:text-base">{name}</span>
      </span>
      <span className="nums text-[2.75rem] font-black leading-none tabular-nums sm:text-8xl" style={{ color, opacity: lead ? 1 : 0.85 }}>
        {score}
      </span>
    </div>
  )
}

export function ClockAdjust({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="nums rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold tabular-nums text-white/80 transition hover:bg-white/20 active:scale-90">
      {children}
    </button>
  )
}

export function SbButton({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title?: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
        danger ? 'bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
      {children}
    </button>
  )
}
```

Dans `src/ui/screens/LiveMatch.tsx` : supprimer les quatre définitions locales et importer

```tsx
import { ClockAdjust, PeriodStrip, ScoreSide, SbButton } from '../components/Scoreboard'
```

- [ ] **Step 4: Écrire `SoloLiveMatch`**

Créer `src/ui/screens/SoloLiveMatch.tsx` :

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GameClock } from '../components/GameClock'
import { TeamPanel } from '../components/TeamPanel'
import { PlayerActionDialog } from '../components/PlayerActionDialog'
import { ClockEditDialog } from '../components/ClockEditDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StartingFiveGate } from '../components/StartingFiveGate'
import { SubstitutionDialog } from '../components/SubstitutionDialog'
import { ClockAdjust, PeriodStrip, ScoreSide, SbButton } from '../components/Scoreboard'
import { useAdmin } from '../../app/admin'
import { syncEnabled, publishBundle } from '../../app/sync'
import { useMatch } from '../../app/useMatch'
import { liveState } from '../../rules/ffbb'
import { playerStats } from '../../domain/boxscore'
import { listPlayers, listTeams } from '../../persistence/repositories'
import { periodLength } from '../../domain/ids'
import type { Match, Period, Player, ScoreKind, ShotSpot, StatKind, FoulType } from '../../domain/types'

const TEAM_A = 'var(--team-a)'
const OPP_POINTS: ScoreKind[] = ['lf', '2int', '3']
const OPP_LABEL: Record<string, string> = { lf: '+1', '2int': '+2', '3': '+3' }

/** Chrono restant à reprendre pour la période courante. */
function seedSeconds(match: Match, period: Period): number {
  for (let i = match.events.length - 1; i >= 0; i--)
    if (match.events[i].period === period) return match.events[i].gameClock
  return periodLength(period)
}

/**
 * Table de marque du mode « une seule équipe » : notre effectif est détaillé
 * joueur par joueur, l'adversaire se résume à un score saisi globalement.
 */
export function SoloLiveMatch({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const navigate = useNavigate()
  const { isAdmin, guard } = useAdmin()
  const { match, dispatch, dispatchMany, undo, removeLast, finish, error } = useMatch(matchId)
  const [askFinish, setAskFinish] = useState(false)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [teamNames, setTeamNames] = useState<{ A: string; B: string }>({ A: 'Mon équipe', B: 'Adversaire' })
  const [seconds, setSeconds] = useState(600)
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null)
  const [starters, setStarters] = useState<string[]>([])
  const [sub, setSub] = useState(false)
  const [editClock, setEditClock] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seededMatchId = useRef<string | null>(null)

  const ls = match ? liveState(match) : null

  useEffect(() => {
    if (!match) return
    Promise.all([listPlayers(match.meta.teamAId), listTeams()]).then(([a, teams]) => {
      setPlayers(Object.fromEntries(a.map((p) => [p.id, p])))
      const byId = Object.fromEntries(teams.map((t) => [t.id, t.name]))
      setTeamNames({ A: byId[match.meta.teamAId] ?? 'Mon équipe', B: byId[match.meta.teamBId] ?? 'Adversaire' })
    })
  }, [match?.meta.teamAId, match?.meta.teamBId])

  useEffect(() => {
    if (!match || !ls || seededMatchId.current === match.id) return
    seededMatchId.current = match.id
    setSeconds(seedSeconds(match, ls.period))
  }, [match, ls])

  useEffect(() => {
    if (ls?.clockRunning) {
      timer.current = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
      return () => clearInterval(timer.current)
    }
  }, [ls?.clockRunning])

  useEffect(() => {
    if (!match || !syncEnabled()) return
    publishBundle({ match, players: Object.values(players), teamNames })
  }, [match, players, teamNames])

  if (!match || !ls)
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>

  if (!isAdmin)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-extrabold tracking-tight">Accès table de marque</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Le mot de passe administrateur est requis pour saisir la rencontre.</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => guard(() => {})} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110">
            🔓 Déverrouiller
          </button>
          <Link to={`/match/${matchId}/watch`} className="rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted">
            👁 Suivi spectateur
          </Link>
        </div>
        <button onClick={() => navigate('/')} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground">← Accueil</button>
      </div>
    )

  const rosterPlayers = match.roster.A.map((id) => players[id]).filter(Boolean)

  if (!match.events.some((e) => e.type === 'STARTING_FIVE' && e.team === 'A')) {
    const required = Math.min(5, match.roster.A.length)
    const toggle = (_side: 'A' | 'B', id: string) =>
      setStarters((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= required ? cur : [...cur, id]))
    const byNumber = (ids: string[]) => [...ids].sort((a, b) => (players[a]?.number ?? 0) - (players[b]?.number ?? 0))
    return (
      <StartingFiveGate
        rosterA={rosterPlayers} rosterB={[]} requiredA={required} requiredB={0}
        selected={{ A: starters, B: [] }} onToggle={toggle}
        canStart={starters.length === required}
        onStart={() => guard(() => dispatch({ type: 'STARTING_FIVE', team: 'A', playerIds: byNumber(starters), period: ls.period, gameClock: periodLength(ls.period) }))}
        onExit={() => navigate('/')}
      />
    )
  }

  const toggleClock = () =>
    dispatch({ type: ls.clockRunning ? 'CLOCK_STOP' : 'CLOCK_START', period: ls.period, gameClock: seconds })

  const statsByPlayer = () => {
    const map = new Map<string, { points: number; fouls: number }>()
    for (const s of playerStats(match, 'A')) map.set(s.playerId, { points: s.points, fouls: s.fouls })
    return map
  }
  const score = (kind: ScoreKind, shot?: ShotSpot) => pick &&
    dispatch({ type: 'SCORE', team: 'A', playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
  const miss = (kind: ScoreKind, shot: ShotSpot) => pick &&
    dispatch({ type: 'MISS', team: 'A', playerId: pick.id, kind, shot, period: ls.period, gameClock: seconds })
  const foul = (type: FoulType) => pick &&
    dispatch({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: pick.id }, foulType: type, period: ls.period, gameClock: seconds })

  // Panier adverse : pas de joueur identifié, seul le score compte.
  const oppScore = (kind: ScoreKind) =>
    dispatch({ type: 'SCORE', team: 'B', kind, period: ls.period, gameClock: seconds })
  const removeOppScore = () =>
    removeLast((e) => e.type === 'SCORE' && e.team === 'B' && !e.playerId)

  const countOf = <T extends string>(keys: T[], read: (e: Match['events'][number]) => T | null): Record<T, number> => {
    const c = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>
    for (const e of match.events) { const k = read(e); if (k) c[k]++ }
    return c
  }
  const scoreCounts = (id: string) =>
    countOf<ScoreKind>(['2int', '2ext', '3', 'lf'], (e) =>
      e.type === 'SCORE' && e.team === 'A' && e.playerId === id ? e.kind : null)
  const statCounts = (id: string) =>
    countOf<StatKind>(['assist', 'reb_off', 'reb_def', 'block'], (e) =>
      e.type === 'STAT' && e.team === 'A' && e.playerId === id ? e.stat : null)
  const missCount = (id: string) =>
    match.events.filter((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === id).length

  const clampClock = (s: number) => Math.min(periodLength(ls.period), Math.max(0, s))
  const onCourt = () => {
    const byId = new Map(rosterPlayers.map((p) => [p.id, p]))
    return ls.onCourt.A.map((id) => byId.get(id)).filter((p): p is Player => !!p)
  }
  const bench = () => {
    const on = new Set(ls.onCourt.A), out = new Set(ls.fouledOut.A)
    return rosterPlayers.filter((p) => !on.has(p.id) && !out.has(p.id))
  }

  const nextPeriod = () => {
    const next = ls.period + 1
    dispatchMany([
      { type: 'PERIOD_END', period: ls.period, gameClock: seconds },
      { type: 'PERIOD_START', period: next, gameClock: periodLength(next) },
    ])
    setSeconds(periodLength(next))
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-4 pb-4 pt-3 text-[var(--scoreboard-fg)] sm:px-6" style={{ background: 'var(--scoreboard)' }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <PeriodStrip current={ls.period} />
          <div className="flex items-center gap-2">
            <SbButton onClick={undo} title="Annuler la dernière action">↩︎ Annuler</SbButton>
            <SbButton onClick={nextPeriod}>Période suivante →</SbButton>
            <SbButton onClick={() => setAskFinish(true)} danger>Terminer</SbButton>
          </div>
        </div>

        <div className="mx-auto mt-3 grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-1 overflow-hidden sm:gap-6">
          <ScoreSide align="right" color="var(--sb-team-a)" name={teamNames.A} score={ls.score.a} lead={ls.score.a > ls.score.b} />
          <div className="flex flex-col items-center gap-2">
            <GameClock running={ls.clockRunning} seconds={seconds} onToggle={toggleClock} />
            <div className="flex flex-wrap items-center justify-center gap-1" title="Corriger le chrono (buzzer)">
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 10))}>−10s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s - 1))}>−1s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 1))}>+1s</ClockAdjust>
              <ClockAdjust onClick={() => setSeconds((s) => clampClock(s + 10))}>+10s</ClockAdjust>
              <ClockAdjust onClick={() => setEditClock(true)}>✎ Éditer</ClockAdjust>
            </div>
          </div>
          <ScoreSide align="left" color="var(--sb-team-b)" name={teamNames.B} score={ls.score.b} lead={ls.score.b > ls.score.a} />
        </div>
      </header>

      {error && <div className="bg-red-500/10 py-1.5 text-center text-sm font-semibold text-red-600">{error}</div>}

      {/* SCORE ADVERSE : global, sans joueurs */}
      <div className="mx-auto mt-2 flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/50 px-4 py-2.5 sm:mt-4">
        <span className="text-sm font-extrabold uppercase tracking-tight">{teamNames.B}</span>
        <span className="text-[11px] font-semibold text-muted-foreground">score global — pas de détail joueur</span>
        <div className="ml-auto flex items-center gap-1.5">
          {OPP_POINTS.map((k) => (
            <button key={k} onClick={() => oppScore(k)} aria-label={`Ajouter ${OPP_LABEL[k].slice(1)} points à ${teamNames.B}`}
              className="nums rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-black text-white transition hover:bg-[#ff4d6d] active:scale-90">
              {OPP_LABEL[k]}
            </button>
          ))}
          <button onClick={removeOppScore} aria-label={`Retirer le dernier panier de ${teamNames.B}`}
            className="rounded-lg bg-white/[0.06] px-2.5 py-2 text-sm font-bold text-muted-foreground transition hover:bg-[#ff4d6d] hover:text-white active:scale-90">
            ↺
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 p-2 sm:p-4">
        <TeamPanel
          title={teamNames.A.toUpperCase()} color={TEAM_A} players={onCourt()}
          statsByPlayer={statsByPlayer()} teamFouls={ls.teamFoulsThisPeriod.A}
          bonus={ls.bonus.A} timeoutsRemaining={ls.timeoutsRemaining.A} timeoutsUsed={ls.timeoutsUsed.A}
          onPick={(id, name) => setPick({ id, name })}
          onScore={(id, kind) => dispatch({ type: 'SCORE', team: 'A', playerId: id, kind, period: ls.period, gameClock: seconds })}
          onFoul={(id) => dispatch({ type: 'FOUL', team: 'A', target: { kind: 'player', playerId: id }, foulType: 'personal', period: ls.period, gameClock: seconds })}
          onSub={() => setSub(true)}
          onTimeout={() => dispatch({ type: 'TIMEOUT', team: 'A', period: ls.period, gameClock: seconds })}
          onUndoTimeout={() => removeLast((e) => e.type === 'TIMEOUT' && e.team === 'A')}
        />
      </div>

      <PlayerActionDialog
        open={!!pick} playerName={pick?.name ?? ''} color={TEAM_A}
        scoreCounts={pick ? scoreCounts(pick.id) : undefined}
        statCounts={pick ? statCounts(pick.id) : undefined}
        fouls={pick ? statsByPlayer().get(pick.id)?.fouls ?? 0 : 0}
        misses={pick ? missCount(pick.id) : 0}
        onClose={() => setPick(null)} onScore={score} onMiss={miss} onFoul={foul}
        onStat={(kind) => pick && dispatch({ type: 'STAT', team: 'A', playerId: pick.id, stat: kind, period: ls.period, gameClock: seconds })}
        onRemoveScore={(kind) => pick && removeLast((e) => e.type === 'SCORE' && e.team === 'A' && e.playerId === pick.id && e.kind === kind)}
        onRemoveFoul={() => pick && removeLast((e) => e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player' && e.target.playerId === pick.id)}
        onRemoveStat={(kind) => pick && removeLast((e) => e.type === 'STAT' && e.team === 'A' && e.playerId === pick.id && e.stat === kind)}
        onRemoveMiss={() => pick && removeLast((e) => e.type === 'MISS' && e.team === 'A' && e.playerId === pick.id)}
      />
      <ClockEditDialog open={editClock} seconds={seconds} max={periodLength(ls.period)}
        onClose={() => setEditClock(false)} onSubmit={(s) => setSeconds(clampClock(s))} />
      <ConfirmDialog open={askFinish} onClose={() => setAskFinish(false)} onConfirm={async () => { await finish(); onFinish() }}
        title="Terminer le match ?" message="Le score est figé et la rencontre passe en « terminée ». Cette action est définitive." confirmLabel="Terminer" danger />
      <SubstitutionDialog open={sub} onClose={() => setSub(false)}
        onCourtPlayers={onCourt()} benchPlayers={bench()}
        onSubmit={(playerOutId, playerInId) => dispatch({ type: 'SUBSTITUTION', team: 'A', playerOutId, playerInId, period: ls.period, gameClock: seconds })} />
    </div>
  )
}
```

- [ ] **Step 5: Écrire l'aiguilleur et brancher la route**

Créer `src/ui/screens/LiveRouter.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { LiveMatch } from './LiveMatch'
import { SoloLiveMatch } from './SoloLiveMatch'
import { getMatch } from '../../persistence/repositories'

/**
 * `/match/:id/live` sert deux écrans selon le mode de la rencontre. L'URL est
 * commune pour que tous les liens existants (accueil, calendrier, fiche équipe)
 * restent valides sans modification.
 */
export function LiveRouter({ matchId, onFinish }: { matchId: string; onFinish: () => void }) {
  const [solo, setSolo] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    getMatch(matchId).then((m) => { if (!cancelled) setSolo(m?.meta.solo === true) })
    return () => { cancelled = true }
  }, [matchId])

  if (solo === null) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>
  return solo ? <SoloLiveMatch matchId={matchId} onFinish={onFinish} /> : <LiveMatch matchId={matchId} onFinish={onFinish} />
}
```

Dans `src/App.tsx`, remplacer l'import `LiveMatch` par `LiveRouter` et le corps de `LiveRoute` :

```tsx
import { LiveRouter } from './ui/screens/LiveRouter'
```

```tsx
function LiveRoute() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <LiveRouter matchId={id} onFinish={() => navigate(`/match/${id}/summary`)} />
}
```

- [ ] **Step 6: Lancer les tests et le build**

Run: `pnpm test && pnpm build`
Expected: PASS et compilation réussie.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/Scoreboard.tsx src/ui/screens/SoloLiveMatch.tsx src/ui/screens/SoloLiveMatch.test.tsx src/ui/screens/LiveRouter.tsx src/ui/screens/LiveMatch.tsx src/App.tsx
git commit -m "feat(live): écran dédié au mode « une seule équipe » avec score adverse global"
```

---

### Task 9 : Réussite aux tirs dans la feuille et données de démonstration

**Files:**
- Modify: `src/ui/screens/SummaryScreen.tsx:224-254`, `src/dev/seed.ts:10,31-40,61-103`
- Test: aucun nouveau ; la suite existante doit rester verte.

**Interfaces:**
- Consumes: `PlayerStat.misses` (Task 2), `zoneAt` non requis ici.
- Produces: colonne « %Tirs » dans le box score ; matchs de démonstration avec positions de tir et un match solo.

- [ ] **Step 1: Ajouter la colonne de réussite au box score**

Dans `src/ui/screens/SummaryScreen.tsx`, fonction `TeamTable` :

Ligne d'entête (ligne 226) — insérer `<Th>%Tirs</Th>` juste après `<Th>Tirs</Th>` :

```tsx
              <Th left>N°</Th><Th left>Joueur</Th><Th>5</Th><Th>Tps</Th><Th>Pts</Th><Th>Tirs</Th><Th>%Tirs</Th><Th>3pts</Th><Th>2 Int</Th><Th>2 Ext</Th><Th>LF</Th><Th>PD</Th><Th>RO</Th><Th>RD</Th><Th>CT</Th><Th>Ftes</Th>
```

Ligne joueur (ligne 242) — insérer après `<Td>{s.fieldGoalsMade}</Td>` :

```tsx
                  <Td>{s.fieldGoalsMade + s.misses > 0 ? `${Math.round((s.fieldGoalsMade / (s.fieldGoalsMade + s.misses)) * 100)} %` : '—'}</Td>
```

Ligne de total (ligne 251) — insérer après `<Td><b>{totals.team.fieldGoalsMade}</b></Td>` une cellule vide, pour garder l'alignement des colonnes :

```tsx
              <Td></Td>
```

- [ ] **Step 2: Vérifier la feuille imprimable**

Run: `pnpm test src/export/PrintableSummary.test.tsx`
Expected: PASS. `PrintableSummary` a ses propres colonnes et n'est pas concerné par ce changement ; si un test compare un nombre de colonnes du `SummaryScreen`, l'ajuster à la nouvelle valeur.

- [ ] **Step 3: Enrichir le seed de positions de tir**

Dans `src/dev/seed.ts` :

Passer la version pour forcer le re-seed (ligne 10) :

```ts
const SEED_VERSION = 'v8'
```

Remplacer la fonction `baskets` (lignes 31-40) par :

```ts
/** Positions de tir plausibles : beaucoup de raquette, des corners, un peu d'axe. */
const SPOTS: { x: number; y: number }[] = [
  { x: 0.50, y: 0.14 }, { x: 0.45, y: 0.18 }, { x: 0.56, y: 0.16 }, // raquette
  { x: 0.24, y: 0.24 }, { x: 0.76, y: 0.24 }, { x: 0.50, y: 0.45 }, // mi-distance
  { x: 0.03, y: 0.10 }, { x: 0.97, y: 0.11 }, { x: 0.50, y: 0.68 }, // 3 points
]

/** Répartit ~`points` en paniers positionnés, pondérés (les premiers joueurs marquent
 *  plus), avec un tir manqué toutes les trois tentatives pour alimenter les hot zones. */
function baskets(side: TeamSide, roster: string[], points: number, clock: () => number): GameEvent[] {
  const weighted = roster.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id) as string[])
  const out: GameEvent[] = []
  const n2 = Math.floor(points / 2)
  for (let k = 0; k < n2; k++) {
    const playerId = weighted[k % weighted.length]
    const shot = SPOTS[k % SPOTS.length]
    out.push(ev({ type: 'SCORE', team: side, playerId, kind: kindAt(shot.x, shot.y), shot, period: 1, gameClock: clock() }))
    if (k % 3 === 2) {
      const missed = SPOTS[(k + 4) % SPOTS.length]
      out.push(ev({ type: 'MISS', team: side, playerId, kind: kindAt(missed.x, missed.y), shot: missed, period: 1, gameClock: clock() }))
    }
  }
  if (points % 2) out.push(ev({ type: 'SCORE', team: side, playerId: weighted[0], kind: 'lf' as ScoreKind, period: 1, gameClock: clock() }))
  return out
}
```

Ajouter l'import en tête du fichier :

```ts
import { kindAt } from '../domain/shotzones'
```

> Le seed déduit le `kind` avec `kindAt`, comme l'UI. Recopier la règle ici la ferait
> diverger silencieusement le jour où la géométrie bouge.

- [ ] **Step 4: Ajouter un match solo au seed**

Dans `buildMatch`, remplacer le bloc de construction du retour (lignes 96-102) par :

```ts
  // Le dernier match terminé de la première journée sert de démonstration au
  // mode « une seule équipe » : effectif adverse vide, score adverse global.
  const solo = idx === 2
  if (solo)
    events = events.map((e) =>
      e.type !== 'SCORE' || e.team !== 'B' ? e : ({ ...e, playerId: undefined, shot: undefined } as GameEvent),
    ).filter((e) => !(e.team === 'B' && (e.type === 'MISS' || e.type === 'STAT' || e.type === 'STARTING_FIVE')))

  return {
    id: `seed-m${idx}`,
    meta: {
      championshipLabel: CHAMP, matchNumber: String(40 + idx), date: DATES[round], time: TIMES[slot],
      venue: TEAMS[home][0].split(' ').pop(), coachA: TEAMS[home][1], coachB: solo ? undefined : TEAMS[away][1],
      referee1: 'BART S', referee2: 'WEISSE F', teamAId: teamId(home), teamBId: teamId(away),
      ...(solo ? { solo: true as const } : {}),
    },
    roster: { A: aRoster, B: solo ? [] : bRoster },
    events,
    status,
  }
```

> `e.team` n'existe pas sur tous les évènements ; TypeScript le sait. Écrire le filtre
> avec un garde explicite si le compilateur proteste :
> `.filter((e) => !('team' in e && e.team === 'B' && (e.type === 'MISS' || e.type === 'STAT' || e.type === 'STARTING_FIVE')))`

- [ ] **Step 5: Vérifier en conditions réelles**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert.

Puis démarrer le serveur de développement via `preview_start` (jamais via Bash) et vérifier à l'écran :

1. `/teams/seed-t0` → cliquer un joueur → la fiche affiche une hot zone carrière colorée.
2. `/match/seed-m0/summary` → la colonne `%Tirs` est remplie et les noms sont cliquables.
3. `/match/seed-m2/live` → une seule colonne d'équipe, la barre adverse avec `+1 / +2 / +3` et `↺`.
4. `/classement` → le match solo `seed-m2` compte bien dans le classement.
5. Sur un match live à deux équipes, ouvrir un joueur, toucher le terrain, vérifier que les points correspondent à la zone.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/SummaryScreen.tsx src/dev/seed.ts
git commit -m "feat(demo): réussite aux tirs dans la feuille et données de démo positionnées"
```

---

## Auto-relecture

**Couverture du spec**

| Section du spec | Tâche |
|---|---|
| §1 Modèle de données | Task 2 |
| §2 Géométrie des zones | Task 1 |
| §3 Carte de tir (SVG, picker, chart) | Task 4 |
| §4 Saisie popup + `TeamPanel` | Task 5 |
| §5 Agrégation `shotchart` + `PlayerStat` | Tasks 2 et 3 |
| §6 Fiche joueur `/players/:id` | Task 6 |
| §7 Mode solo — création, `StartingFiveGate` | Task 7 |
| §7 Mode solo — écran live, `LiveRouter` | Task 8 |
| §8 Seed | Task 9 |

**Écart assumé par rapport au spec** — le spec prévoyait de tester un tir exactement *sur* la ligne à 3 points. Les coordonnées normalisées ne permettent pas d'atteindre la ligne au flottant près de façon déterministe ; la Task 1 teste donc 5 cm de part et d'autre. La règle stricte (« sur la ligne = 2 points ») reste implémentée et commentée dans `zoneAt`.

**Cohérence des types** — `ShotSpot` (Task 2) est le seul type de coordonnées, consommé identiquement par `shotsOf` (Task 3), `ShotPicker`/`ShotChart` (Task 4) et les dispatchs (Tasks 5, 8). `ShotZone` et `ZONE_CENTROID` (Task 1) sont référencés sous les mêmes noms dans les Tasks 3, 4 et 6. La signature de `PlayerActionDialog` change en un seul endroit (Task 5) et ses deux appelants — `LiveMatch` et `SummaryScreen` — sont mis à jour dans cette même tâche ; `SoloLiveMatch` (Task 8) l'utilise déjà avec la nouvelle signature.
