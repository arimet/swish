# Terrain de tir : retour au tap, lisibilité, zones déjà tirées — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la saisie d'un tir vérifiable d'un coup d'œil, le demi-terrain lisible, et l'historique des tirs d'un joueur visible pendant le match — dans la popup de saisie comme sur l'écran de suivi.

**Architecture:** Aucun changement de domaine. `ShotPicker` devient un composant **contrôlé** : la popup possède l'état de confirmation et le lui passe, ce qui neutralise la saisie pendant l'affichage du retour et remet l'état à zéro à chaque ouverture sans artifice de `key`. Le reste est décoratif ou de l'affichage de données déjà calculées par `shotsOf`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Tailwind v4, SVG natif (animations SMIL, aucune dépendance ajoutée).

## Global Constraints

- Commentaires, libellés et messages de commit **en français accentué** (`é`, `è`, `à`, `ç`). Le dépôt entier est ainsi et le lint l'accepte. Si des accents disparaissent d'un fichier écrit, c'est un bug d'outillage : réécrire le fichier entier avec Write, puis vérifier avec `grep -c 'à\|é' <fichier>`.
- **Les sept chemins de `ZONE_PATH` ne changent pas.** Leur géométrie a été vérifiée point par point contre `zoneAt` par lancer de rayons. Les modifier désalignerait les zones colorées des zones calculées. Un test fige leur valeur.
- **Aucun fichier de `src/domain/` n'est modifié.** Ce projet rend visible ce qui est déjà enregistré.
- Aucune dépendance npm ajoutée.
- Délai du retour visuel : constante exportée `SHOT_FEEDBACK_MS = 350`, jamais un nombre en dur ailleurs.
- Les tests importent explicitement `describe`/`it`/`expect` depuis `vitest`.
- Commandes : `pnpm test`, `pnpm lint`, `pnpm build`. Les trois doivent passer avant chaque commit.

---

## Structure des fichiers

| Fichier | Rôle après ce projet |
|---|---|
| `src/ui/components/ShotCourt.tsx` | Le gros du travail : retour visuel contrôlé, tracés hiérarchisés, tirs passés en fond |
| `src/ui/components/PlayerActionDialog.tsx` | Possède l'état de confirmation et la fermeture différée |
| `src/ui/components/PlayerActionDialog.test.tsx` | **Créé** — double comptage, fermeture différée, libellé |
| `src/ui/screens/LiveMatch.tsx`, `SoloLiveMatch.tsx`, `SummaryScreen.tsx` | Fournissent les tirs du joueur à la popup |
| `src/ui/screens/SpectatorMatch.tsx` | Lignes de joueur dépliables sur la carte de tirs |

---

### Task 1 : Retour au tap et garde anti-double-comptage

**Files:**
- Modify: `src/ui/components/ShotCourt.tsx`, `src/ui/components/PlayerActionDialog.tsx`
- Test: `src/ui/components/ShotCourt.test.tsx`, `src/ui/components/PlayerActionDialog.test.tsx` (créé)

**Interfaces:**
- Consumes: `zoneAt`, `kindAt`, `ZONE_LABELS`, `ZONE_CENTROID`, `ZONES` (`src/domain/shotzones.ts`) ; `ShotSpot` (`src/domain/types.ts`).
- Produces: `SHOT_FEEDBACK_MS: number` et la nouvelle signature de `ShotPicker` — `{ onPick: (spot: ShotSpot) => void; confirmation?: { spot: ShotSpot; label: string } | null }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `src/ui/components/ShotCourt.test.tsx`, à la suite du `describe('ShotPicker', …)` existant :

```tsx
describe('ShotPicker — confirmation', () => {
  it('affiche le libellé du tir enregistré dans une zone d’état', () => {
    render(<ShotPicker onPick={vi.fn()} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
  })

  it('neutralise le terrain et les boutons de zone tant que la confirmation est affichée', async () => {
    const onPick = vi.fn()
    render(<ShotPicker onPick={onPick} confirmation={{ spot: { x: 0.5, y: 0.15 }, label: '2 PTS · Raquette' }} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    await userEvent.click(screen.getByRole('button', { name: 'Corner gauche' }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('fait vibrer l’appareil quand le navigateur le permet', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    render(<ShotPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Demi-terrain — toucher le point de tir'), { clientX: 150, clientY: 28 })
    expect(vibrate).toHaveBeenCalledWith(15)
    Reflect.deleteProperty(navigator, 'vibrate')
  })
})
```

Créer `src/ui/components/PlayerActionDialog.test.tsx` :

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerActionDialog } from './PlayerActionDialog'
import { SHOT_FEEDBACK_MS } from './ShotCourt'

const noop = vi.fn()

function renderDialog(over: Partial<Parameters<typeof PlayerActionDialog>[0]> = {}) {
  const props = {
    open: true, playerName: '4 ROUX',
    onClose: vi.fn(), onScore: vi.fn(), onMiss: vi.fn(), onFoul: noop, onStat: noop,
    onRemoveScore: noop, onRemoveFoul: noop, onRemoveStat: noop, onRemoveMiss: noop,
    ...over,
  }
  render(<PlayerActionDialog {...props} />)
  return props
}

const court = () => screen.getByLabelText('Demi-terrain — toucher le point de tir')

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom ne calcule pas de mise en page : on fixe la boîte du SVG à 300×280.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 280, right: 300, bottom: 280, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('PlayerActionDialog — saisie du tir', () => {
  it('enregistre un seul tir même si l’on touche le terrain deux fois', () => {
    const { onScore } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    fireEvent.click(court(), { clientX: 40, clientY: 200 })
    expect(onScore).toHaveBeenCalledTimes(1)
  })

  it('affiche les points et la zone avant de fermer', () => {
    const { onClose } = renderDialog()
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(screen.getByRole('status')).toHaveTextContent('2 PTS · Raquette')
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(SHOT_FEEDBACK_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('annonce un tir manqué sans compter de points', () => {
    const { onScore, onMiss } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Manqué' }))
    fireEvent.click(court(), { clientX: 150, clientY: 42 })
    expect(onScore).not.toHaveBeenCalled()
    expect(onMiss).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('MANQUÉ · Raquette')
  })
})
```

> `clientX: 150, clientY: 42` sur une boîte de 300×280 donne `x = 0,5` et `y = 0,15` : la raquette, donc `2int`.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/ui/components/ShotCourt.test.tsx src/ui/components/PlayerActionDialog.test.tsx`
Expected: FAIL — `confirmation` n'existe pas, `SHOT_FEEDBACK_MS` non exporté.

- [ ] **Step 3: Rendre `ShotPicker` contrôlé**

Dans `src/ui/components/ShotCourt.tsx` :

Remplacer la ligne d'import des zones par :

```tsx
import { zoneAt, ZONE_CENTROID, ZONE_LABELS, ZONES, type ShotZone } from '../../domain/shotzones'
```

Ajouter après les constantes `W` / `D` :

```tsx
/** Durée d'affichage du retour visuel après un tap, avant fermeture de la popup. */
export const SHOT_FEEDBACK_MS = 350

/** Vibration courte là où le navigateur la supporte. iOS ne l'implémente sur aucun
 *  navigateur : le retour visuel reste le mécanisme principal, la vibration un bonus. */
function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15)
}
```

Remplacer intégralement `ShotPicker` par :

```tsx
/**
 * Terrain de saisie, **contrôlé** : c'est l'appelant qui détient la confirmation du
 * dernier tir. Tant qu'elle est posée, toute saisie est neutralisée — sans ce garde,
 * un second tap pendant les 350 ms d'affichage enregistrerait un second tir.
 * Les sept boutons sous le terrain donnent le même résultat au clavier, à la
 * précision de la zone près.
 */
export function ShotPicker({ onPick, confirmation }: {
  onPick: (spot: ShotSpot) => void
  confirmation?: { spot: ShotSpot; label: string } | null
}) {
  const locked = !!confirmation
  const commit = (spot: ShotSpot) => {
    if (locked) return
    buzz()
    onPick(spot)
  }
  const pickFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    if (locked) return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    commit({ x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) })
  }
  return (
    <div>
      <Court label="Demi-terrain — toucher le point de tir" onClick={pickFromEvent}>
        <CourtLines />
        {confirmation && <Confirmation spot={confirmation.spot} />}
      </Court>
      {confirmation && (
        <p role="status" className="mt-2 rounded-lg px-3 py-1.5 text-center text-[13px] font-black uppercase tracking-wide"
          style={{ background: C.accentBg, color: C.accent }}>
          {confirmation.label}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ZONES.map((z) => (
          <button
            key={z}
            disabled={locked}
            onClick={() => commit(ZONE_CENTROID[z])}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-125 disabled:opacity-40"
            style={{ background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}
          >
            {ZONE_LABELS[z]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Point de tir enregistré : zone illuminée, point plein, anneau qui s'étend. */
function Confirmation({ spot }: { spot: ShotSpot }) {
  const cx = spot.x * W
  const cy = spot.y * D
  return (
    <g>
      <path d={ZONE_PATH[zoneAt(spot.x, spot.y)]} fill={C.accent} fillOpacity={0.22} />
      <circle cx={cx} cy={cy} r={26} fill={C.accent} />
      <circle cx={cx} cy={cy} r={26} fill="none" stroke={C.accent} strokeWidth={10}>
        <animate attributeName="r" from="26" to="160" dur="0.35s" fill="freeze" />
        <animate attributeName="opacity" from="0.9" to="0" dur="0.35s" fill="freeze" />
      </circle>
    </g>
  )
}
```

- [ ] **Step 4: Faire porter la confirmation et la fermeture différée par la popup**

Dans `src/ui/components/PlayerActionDialog.tsx` :

Remplacer les deux premières lignes d'import par :

```tsx
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker, SHOT_FEEDBACK_MS } from './ShotCourt'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
```

Ajouter après la constante `ZERO_T` :

```tsx
const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }
```

Dans le corps du composant, remplacer la déclaration d'état, `close` et `pick` par :

```tsx
  const [made, setMade] = useState(true)
  const [confirmation, setConfirmation] = useState<{ spot: ShotSpot; label: string } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sans cette annulation, fermer la popup à la main pendant le délai déclencherait
  // une mise à jour d'état sur un composant démonté.
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Le mode revient à « Réussi » à chaque fermeture : c'est le cas courant.
  const close = () => {
    clearTimeout(closeTimer.current)
    setMade(true)
    setConfirmation(null)
    onClose()
  }

  const pick = (spot: ShotSpot) => {
    const kind = kindAt(spot.x, spot.y)
    if (made) onScore(kind, spot); else onMiss(kind, spot)
    setConfirmation({ spot, label: `${made ? POINTS_LABEL[kind] : 'MANQUÉ'} · ${ZONE_LABELS[zoneAt(spot.x, spot.y)]}` })
    closeTimer.current = setTimeout(close, SHOT_FEEDBACK_MS)
  }
```

Remplacer l'appel au terrain par :

```tsx
        <div className="mt-2"><ShotPicker onPick={pick} confirmation={confirmation} /></div>
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert. Si un test existant de `LiveMatch` ou `SummaryScreen` échoue parce qu'il attendait une fermeture immédiate de la popup, l'adapter en avançant les minuteurs — **ne pas** réduire `SHOT_FEEDBACK_MS` à zéro pour faire passer un test.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ShotCourt.tsx src/ui/components/PlayerActionDialog.tsx src/ui/components/ShotCourt.test.tsx src/ui/components/PlayerActionDialog.test.tsx
git commit -m "feat(ui): retour visuel et haptique au tap, avec garde anti-double-comptage"
```

---

### Task 2 : Lisibilité du demi-terrain

**Files:**
- Modify: `src/ui/components/ShotCourt.tsx` (fonctions `CourtLines` et `Court` uniquement)
- Test: `src/ui/components/ShotCourt.test.tsx`

**Interfaces:**
- Consumes: la palette `C` (`src/ui/olive/kit.tsx`).
- Produces: `ZONE_PATH` devient exporté, pour que le test puisse figer sa valeur.

Repères de la `viewBox` `0 0 1500 1400`, en centimètres, ligne de fond en haut : panier `(750, 157.5)` · raquette `x 505→995, y 0→580` · cercle de lancer franc centré `(750, 580)` rayon `180` · zone restrictive rayon `125` autour du panier · panneau à `y = 120`, large de `180`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `src/ui/components/ShotCourt.test.tsx` :

```tsx
import { ShotChart, ShotPicker, ZONE_PATH } from './ShotCourt'

describe('ZONE_PATH', () => {
  // Ces chemins ont été vérifiés point par point contre zoneAt par lancer de rayons.
  // Les modifier désalignerait les zones colorées des zones réellement calculées :
  // un tir compté dans la raquette pourrait s'afficher en mi-distance.
  it('reste littéralement inchangé', () => {
    expect(ZONE_PATH).toEqual({
      paint: 'M 505 0 H 995 V 580 H 505 Z',
      mid_left: 'M 90 0 H 505 V 786.5 A 675 675 0 0 1 90 299.01 Z',
      mid_center: 'M 505 580 H 995 V 786.5 A 675 675 0 0 1 505 786.5 Z',
      mid_right: 'M 1410 0 H 995 V 786.5 A 675 675 0 0 0 1410 299.01 Z',
      corner3_left: 'M 0 0 H 90 V 299.01 H 0 Z',
      corner3_right: 'M 1410 0 H 1500 V 299.01 H 1410 Z',
      top3: 'M 0 299.01 H 90 A 675 675 0 0 0 1410 299.01 H 1500 V 1400 H 0 Z',
    })
  })
})

describe('CourtLines', () => {
  it('donne un identifiant de dégradé distinct à chaque terrain rendu', () => {
    const { container } = render(<><ShotChart shots={[]} /><ShotChart shots={[]} /></>)
    const ids = [...container.querySelectorAll('radialGradient')].map((g) => g.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
```

> Le second test protège contre une régression subtile : deux cartes sur la même page avec le même identifiant de dégradé, et le navigateur applique le premier aux deux.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm test src/ui/components/ShotCourt.test.tsx`
Expected: FAIL — `ZONE_PATH` n'est pas exporté, aucun `radialGradient` n'existe.

- [ ] **Step 3: Exporter `ZONE_PATH` et enrichir les tracés**

Dans `src/ui/components/ShotCourt.tsx` :

Ajouter `export` devant `const ZONE_PATH`, sans en modifier une seule valeur.

Remplacer intégralement `CourtLines` par :

```tsx
/**
 * Tracés réglementaires. Purement décoratif : aucune de ces formes n'entre dans le
 * calcul des zones, qui repose sur `zoneAt` et `ZONE_PATH`.
 * Trois poids de trait : les limites et la ligne à 3 points guident le regard, la
 * raquette et le cercle de lancer franc viennent ensuite, le reste s'efface.
 */
function CourtLines() {
  const major = { fill: 'none', stroke: 'currentColor', strokeWidth: 9, opacity: 0.7 } as const
  const minor = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, opacity: 0.4 } as const
  const faint = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, opacity: 0.22 } as const
  return (
    <g style={{ color: C.muted }}>
      {/* Fond propre à la raquette */}
      <rect x={505} y={0} width={490} height={580} fill={C.text} fillOpacity={0.05} />
      {/* Prolongements des lignes de raquette : laissent deviner les cibles de mi-distance */}
      <g {...faint} strokeDasharray="18 22">
        <line x1={505} y1={580} x2={505} y2={786.5} />
        <line x1={995} y1={580} x2={995} y2={786.5} />
      </g>
      {/* Zone restrictive (1,25 m sous le panier) */}
      <path d="M 625 157.5 A 125 125 0 0 0 875 157.5" {...faint} />
      {/* Cercle de lancer franc : moitié arrière en pointillés, convention FIBA */}
      <path d="M 570 580 A 180 180 0 0 1 930 580" {...minor} />
      <path d="M 930 580 A 180 180 0 0 1 570 580" {...minor} strokeDasharray="30 26" />
      <rect x={505} y={0} width={490} height={580} {...minor} />
      {/* Panneau puis arceau */}
      <rect x={660} y={112} width={180} height={14} fill="currentColor" opacity={0.55} />
      <circle cx={750} cy={157.5} r={22.5} {...major} />
      {/* Ligne à 3 points et limites du terrain */}
      <path d="M 90 0 L 90 299.01 A 675 675 0 0 0 1410 299.01 L 1410 0" {...major} />
      <rect x={4} y={4} width={W - 8} height={D - 8} rx={12} {...major} />
    </g>
  )
}
```

Remplacer `Court` par la version à dégradé. `useId` garantit un identifiant unique par instance : deux cartes sur la même page ne doivent pas partager leur dégradé.

```tsx
function Court({ children, label, onClick }: { children: ReactNode; label: string; onClick?: (e: React.MouseEvent<SVGSVGElement>) => void }) {
  const gid = `court-${useId()}`
  return (
    <svg
      viewBox={`0 0 ${W} ${D}`}
      role={onClick ? 'application' : 'img'}
      aria-label={label}
      onClick={onClick}
      className={`w-full rounded-2xl ${onClick ? 'cursor-crosshair' : ''}`}
      style={{ border: `1px solid ${C.border}`, touchAction: 'manipulation' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="10%" r="95%">
          <stop offset="0%" stopColor={C.card2} />
          <stop offset="100%" stopColor={C.panel} />
        </radialGradient>
      </defs>
      <rect width={W} height={D} fill={`url(#${gid})`} />
      {children}
    </svg>
  )
}
```

Ajouter `useId` à l'import de React en tête de fichier :

```tsx
import { useId, type ReactNode } from 'react'
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert.

- [ ] **Step 5: Vérifier le rendu réel**

Démarrer l'aperçu (jamais via Bash), ouvrir `/players/seed-p0-0` et comparer la carte de chaleur à l'ancienne : la raquette doit se détacher, l'arc doit être le tracé le plus visible, et les points de tir doivent rester lisibles sur le dégradé. Corriger les opacités si un élément écrase les autres.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ShotCourt.tsx src/ui/components/ShotCourt.test.tsx
git commit -m "feat(ui): demi-terrain lisible — hiérarchie des tracés, raquette, zone restrictive"
```

---

### Task 3 : Zones déjà tirées dans la popup et sur le suivi

**Files:**
- Modify: `src/ui/components/ShotCourt.tsx`, `src/ui/components/PlayerActionDialog.tsx`, `src/ui/screens/LiveMatch.tsx`, `src/ui/screens/SoloLiveMatch.tsx`, `src/ui/screens/SummaryScreen.tsx`, `src/ui/screens/SpectatorMatch.tsx`
- Test: `src/ui/components/ShotCourt.test.tsx`, `src/ui/screens/SpectatorMatch.test.tsx` (créé si absent)

**Interfaces:**
- Consumes: `shotsOf` et `Shot` (`src/domain/shotchart.ts`) ; `ShotChart` (Task 2).
- Produces: `ShotPicker` accepte `shots?: Shot[]` ; `PlayerActionDialog` accepte `shots?: Shot[]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `src/ui/components/ShotCourt.test.tsx` :

```tsx
it('dessine en fond les tirs déjà pris par le joueur', () => {
  const shots: Shot[] = [
    { matchId: 'm1', spot: { x: 0.5, y: 0.15 }, zone: 'paint', made: true },
    { matchId: 'm1', spot: { x: 0.5, y: 0.65 }, zone: 'top3', made: false },
  ]
  const { container } = render(<ShotPicker onPick={vi.fn()} shots={shots} />)
  expect(container.querySelectorAll('[data-past-shot]')).toHaveLength(2)
  expect(container.querySelector('[data-past-shot="missed"]')).toBeInTheDocument()
})
```

Créer `src/ui/screens/SpectatorMatch.test.tsx` :

```tsx
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SpectatorMatch } from './SpectatorMatch'
import { db } from '../../persistence/db'
import { saveMatch, savePlayer, saveTeam } from '../../persistence/repositories'
import type { GameEvent, Match } from '../../domain/types'

const TOP3 = { x: 0.5, y: 0.65 }
const MATCH_ID = 'spec-1'

const ev = (e: Partial<GameEvent>, i: number) =>
  ({ id: `e${i}`, wallClock: i, period: 1, gameClock: 600, ...e } as GameEvent)

beforeEach(async () => {
  await db.matches.clear(); await db.players.clear(); await db.teams.clear()
  await saveTeam({ id: 'ta', name: 'VIGNOT' }); await saveTeam({ id: 'tb', name: 'VERDUN' })
  await savePlayer({ id: 'p1', teamId: 'ta', number: 7, lastName: 'MARTIN', firstName: 'Lucas' })
  const m: Match = {
    id: MATCH_ID, meta: { teamAId: 'ta', teamBId: 'tb' },
    roster: { A: ['p1'], B: [] }, status: 'live',
    events: [
      { type: 'STARTING_FIVE', team: 'A', playerIds: ['p1'] },
      { type: 'CLOCK_START' },
      { type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', shot: TOP3 },
    ].map(ev),
  }
  await saveMatch(m)
})

describe('SpectatorMatch — carte de tirs par joueur', () => {
  it('déplie la carte du joueur au clic sur sa ligne', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
    await userEvent.click(row)
    expect(await screen.findByLabelText('Carte des tirs')).toBeInTheDocument()
  })

  it('n’ouvre qu’une carte à la fois et referme au second clic', async () => {
    render(<MemoryRouter><SpectatorMatch matchId={MATCH_ID} /></MemoryRouter>)
    const row = await screen.findByRole('button', { name: /MARTIN/ })
    await userEvent.click(row)
    await userEvent.click(row)
    expect(screen.queryByLabelText('Carte des tirs')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm test src/ui/components/ShotCourt.test.tsx src/ui/screens/SpectatorMatch.test.tsx`
Expected: FAIL — `shots` n'existe pas sur `ShotPicker`, aucune ligne cliquable sur le suivi.

- [ ] **Step 3: Afficher les tirs passés dans le terrain de saisie**

Dans `src/ui/components/ShotCourt.tsx`, étendre la signature de `ShotPicker` et rendre les points **avant** `CourtLines`, pour qu'ils passent sous les tracés et ne concurrencent pas le point de confirmation :

```tsx
export function ShotPicker({ onPick, confirmation, shots }: {
  onPick: (spot: ShotSpot) => void
  confirmation?: { spot: ShotSpot; label: string } | null
  shots?: Shot[]
}) {
```

et, dans le `<Court>` :

```tsx
      <Court label="Demi-terrain — toucher le point de tir" onClick={pickFromEvent}>
        {shots?.map((s, i) => (
          <circle
            key={i}
            data-past-shot={s.made ? 'made' : 'missed'}
            cx={s.spot.x * W} cy={s.spot.y * D} r={11}
            fill={s.made ? C.accent : 'none'}
            stroke={s.made ? 'none' : C.muted} strokeWidth={5}
            opacity={0.5}
          />
        ))}
        <CourtLines />
        {confirmation && <Confirmation spot={confirmation.spot} />}
      </Court>
```

- [ ] **Step 4: Transmettre les tirs depuis la popup et ses trois appelants**

Dans `src/ui/components/PlayerActionDialog.tsx`, ajouter `shots` aux props (type `Shot[] | undefined`, importer `type Shot` depuis `../../domain/shotchart`) et le transmettre :

```tsx
        <div className="mt-2"><ShotPicker onPick={pick} confirmation={confirmation} shots={shots} /></div>
```

Dans `src/ui/screens/LiveMatch.tsx`, importer `shotsOf` depuis `../../domain/shotchart` et ajouter à `<PlayerActionDialog>` :

```tsx
        shots={pick ? shotsOf([match], pick.id) : undefined}
```

Dans `src/ui/screens/SoloLiveMatch.tsx`, même import et même prop.

Dans `src/ui/screens/SummaryScreen.tsx`, même import et même prop — le mode correction affiche ainsi les tirs déjà enregistrés du joueur en cours d'ajustement.

- [ ] **Step 5: Rendre les lignes de joueur dépliables sur le suivi**

Dans `src/ui/screens/SpectatorMatch.tsx` :

Ajouter aux imports :

```tsx
import { shotsOf } from '../../domain/shotchart'
import { ShotChart } from '../components/ShotCourt'
```

Dans `StatList`, ajouter l'état local en tête de fonction :

```tsx
  // Une seule carte ouverte à la fois : cet écran est souvent projeté, deux cartes
  // simultanées le rendraient illisible.
  const [openId, setOpenId] = useState<string | null>(null)
```

Remplacer le `map` des lignes par une version où le nom devient un bouton, suivie d'une ligne dépliée :

```tsx
            {rows.map((s) => {
              const p = players[s.playerId]
              const label = p ? `${p.lastName} ${p.firstName}` : s.playerId
              const isOpen = openId === s.playerId
              return (
                <Fragment key={s.playerId}>
                  <tr style={{ borderTop: `1px solid ${C.border}`, background: isOpen ? C.panel : undefined }}>
                    <td className="px-3 py-2 font-black tabular-nums">{p?.number ?? '—'}</td>
                    <td className="px-2 py-2 font-semibold">
                      <button onClick={() => setOpenId(isOpen ? null : s.playerId)} className="text-left hover:underline">
                        {label} <span style={{ color: C.faint }}>{isOpen ? '▾' : '▸'}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: s.points > 0 && s.points === top ? C.orange : s.points > 0 ? C.text : C.faint }}>{s.points}</td>
                    <Std>{s.threes}</Std><Std>{s.assists}</Std><Std>{s.offRebounds + s.defRebounds}</Std><Std>{s.blocks}</Std>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: s.fouls >= 5 ? C.pink : C.muted }}>{s.fouls}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: C.panel }}>
                      <td colSpan={8} className="px-3 pb-4 pt-1">
                        <ShotChart shots={shotsOf([match], s.playerId)} minAttempts={1} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
```

Ajouter `Fragment` à l'import de React en tête de fichier :

```tsx
import { Fragment, useEffect, useState, type ReactNode } from 'react'
```

> `minAttempts={1}` : sur une seule rencontre, exiger trois tentatives par zone n'afficherait presque jamais rien.

- [ ] **Step 6: Lancer les tests et le build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: tout vert.

- [ ] **Step 7: Vérifier le rendu réel**

Ouvrir `/match/seed-m6/watch` dans l'aperçu, déplier un joueur, vérifier que la carte s'affiche en grand et qu'une seule s'ouvre à la fois. Puis ouvrir la popup d'un joueur en match et vérifier que ses tirs passés apparaissent en fond sans masquer le point de confirmation.

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/ShotCourt.tsx src/ui/components/PlayerActionDialog.tsx src/ui/screens/LiveMatch.tsx src/ui/screens/SoloLiveMatch.tsx src/ui/screens/SummaryScreen.tsx src/ui/screens/SpectatorMatch.tsx src/ui/components/ShotCourt.test.tsx src/ui/screens/SpectatorMatch.test.tsx
git commit -m "feat(ui): tirs déjà pris visibles à la saisie et carte par joueur sur le suivi"
```

---

## Auto-relecture

**Couverture du spec**

| Section du spec | Tâche |
|---|---|
| §1 Retour au tap, garde anti-double-comptage, haptique, fermeture différée | Task 1 |
| §2 Lisibilité du demi-terrain, `ZONE_PATH` figé | Task 2 |
| §3 Tirs passés dans la popup | Task 3, steps 3-4 |
| §3 Carte par joueur sur le suivi | Task 3, step 5 |

**Cohérence des types** — `ShotPicker` gagne ses deux props dans deux tâches distinctes (`confirmation` en Task 1, `shots` en Task 3) ; la Task 3 reprend la signature complète pour éviter toute divergence. `SHOT_FEEDBACK_MS` est défini en Task 1 et consommé par son test au même endroit. `Shot` vient de `src/domain/shotchart.ts` partout.

**Point d'attention pour l'exécutant** — la Task 1 change le moment de fermeture de la popup. Des tests existants de `LiveMatch`, `SoloLiveMatch` ou `SummaryScreen` peuvent supposer une fermeture immédiate. Les adapter en avançant les minuteurs est correct ; réduire `SHOT_FEEDBACK_MS` pour les faire passer ne l'est pas.
