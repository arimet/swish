# Positions de tir, statistiques joueur et mode « une seule équipe »

Date : 2026-08-07 · Branche : `claude/shot-positions-player-stats-e92c9b`

## Objectif

Trois fonctionnalités liées :

1. **Position du tir.** Dans la popup joueur, la table de marque touche l'endroit du
   terrain d'où le joueur a tiré. La zone détermine le nombre de points. Les tirs
   manqués se saisissent aussi.
2. **Statistiques par joueur.** Une fiche joueur avec ses totaux, sa hot zone du match
   et sa hot zone carrière.
3. **Mode « une seule équipe ».** Des matchs où l'on ne détaille que sa propre équipe,
   sans tenir la feuille adverse. Le score de l'adversaire se saisit globalement, donc le
   match reste un vrai match : résultat, bilan et classement continuent de fonctionner.

## Décisions actées

| Question | Choix |
|---|---|
| Tirs manqués | Saisis, avec position — sans eux la hot zone ne mesure aucune efficacité |
| Saisie du tir | Le terrain **remplace** les boutons 2int/2ext/3 dans la popup |
| Adversaire en mode solo | Score global saisi (+1/+2/+3), sans joueurs. Le match compte normalement au classement |
| Granularité | 7 zones |
| Rendu de la carte | Zones colorées par % **+** tirs individuels en points |
| Fiche joueur | Nouvelle route `/players/:id` |
| Écran live solo | Écran dédié, pas de conditionnels dans l'écran deux équipes |

---

## 1. Modèle de données

`src/domain/types.ts` :

```ts
/** Position du tir, normalisée dans le demi-terrain :
 *  x 0..1 de la touche gauche à la touche droite,
 *  y 0..1 de la ligne de fond à la ligne médiane. */
export interface ShotSpot { x: number; y: number }

export type GameEvent =
  | ...
  // playerId absent = point d'équipe sans joueur identifié (score adverse en mode solo)
  | (EventBase & { type: 'SCORE'; team: TeamSide; playerId?: string; kind: ScoreKind; shot?: ShotSpot })
  | (EventBase & { type: 'MISS';  team: TeamSide; playerId: string;  kind: ScoreKind; shot: ShotSpot })
```

`MatchMeta` gagne `solo?: true`.

**Pourquoi cette forme :**

- `shot` est **optionnel** sur `SCORE` : les matchs déjà enregistrés restent valides et
  aucune migration Dexie n'est nécessaire (les évènements vivent dans le document match,
  pas dans un index).
- `MISS` est un **nouveau type**, pas un drapeau `made: false` sur `SCORE`. Les huit
  consommateurs de `SCORE` (`ffbb.liveState`, `boxscore`, `totals`, `progression`,
  `reducer.validateEvent`, `LiveMatch`, `SummaryScreen`, `seed`) filtrent tous sur
  `e.type === 'SCORE'`. Un nouveau type est donc ignoré par construction : aucun risque
  qu'un tir manqué compte des points quelque part.
- La **zone n'est pas stockée**. Elle se recalcule depuis `x,y` par une fonction pure.
  Une seule source de vérité, et la géométrie reste corrigeable a posteriori sur
  l'historique.
- `kind` reste stocké sur `SCORE` : c'est le contrat existant dont dépendent les points.
  Il est simplement **déduit de la zone** au moment de la saisie.
- `playerId` devient **optionnel** au lieu d'introduire un type `TEAM_SCORE`. Vérifié dans
  le code : `liveState` (`ffbb.ts:56`), `totals` (`totals.ts:76`) et `progression`
  agrègent par équipe sans jamais lire `playerId`, et `playerStats` fait
  `stats.get(e.playerId)` → `undefined` → `continue`. Un panier sans joueur compte donc
  au score, au classement et dans les totaux par période, mais dans la ligne d'aucun
  joueur — exactement le comportement voulu. Un nouveau type d'évènement aurait imposé de
  modifier ces trois sélecteurs, avec le risque d'en oublier un et de fausser un score.

En mode solo, `roster.B` est vide et les seuls évènements `team: 'B'` sont des `SCORE`
sans `playerId`.

## 2. Géométrie des zones — `src/domain/shotzones.ts` (nouveau)

```ts
export type ShotZone =
  | 'paint' | 'mid_left' | 'mid_center' | 'mid_right'
  | 'corner3_left' | 'top3' | 'corner3_right'

export function zoneAt(x: number, y: number): ShotZone
export function kindAt(x: number, y: number): '2int' | '2ext' | '3'
export const ZONE_LABELS: Record<ShotZone, string>
```

Cotes FIBA sur un demi-terrain de 15 × 14 m, exprimées en mètres puis normalisées :

| Élément | Cote |
|---|---|
| Centre du panier | x = 7,50 m · y = 1,575 m depuis la ligne de fond |
| Raquette | 4,90 m de large × 5,80 m de profondeur depuis la ligne de fond |
| Arc à 3 points | rayon 6,75 m autour du centre du panier |
| Corners à 3 points | droites à 0,90 m de chaque touche, jusqu'à la jonction avec l'arc |

Règle de `zoneAt`, dans cet ordre :

1. Dans le rectangle de la raquette → `paint`.
2. Au-delà de la ligne à 3 points :
   - sous la jonction corner/arc → `corner3_left` ou `corner3_right` selon le côté ;
   - au-dessus → `top3`.
3. Sinon (2 points hors raquette) → `mid_left` / `mid_center` / `mid_right`, découpés par
   les **prolongements des lignes de raquette** (et non par des tiers arbitraires), ce qui
   correspond à la lecture naturelle d'un terrain.

`kindAt` : `paint → '2int'`, `mid_* → '2ext'`, `corner3_*`/`top3 → '3'`.

Un point exactement **sur** la ligne à 3 points vaut 2 (règle FIBA : le tireur doit avoir
les deux pieds au-delà). Le test fige ce comportement.

**Test** — `src/domain/shotzones.test.ts` : un point représentatif par zone, plus les cas
limites : pied sur la ligne à 3 points, corner juste avant et juste après la jonction avec
l'arc, point sur la ligne de raquette, tir depuis le milieu de terrain.

## 3. Carte de tir — `src/ui/components/ShotCourt.tsx` (nouveau)

Un fichier, trois exports :

```ts
/** Tracés du demi-terrain. viewBox en centimètres : 0 0 1500 1400. */
function HalfCourt({ children }: { children?: ReactNode })

/** Terrain cliquable. Retourne des coordonnées normalisées 0..1. */
export function ShotPicker({ onPick }: { onPick: (spot: ShotSpot) => void })

/** Carte de chaleur : zones teintées + tirs individuels. */
export function ShotChart({ shots, compact }: { shots: Shot[]; compact?: boolean })
```

- Le SVG est thémé clair/sombre via les variables CSS existantes (`--border`, `--card`,
  `--muted-foreground`), pas de couleurs en dur.
- `ShotPicker` convertit le clic en coordonnées normalisées à partir de la `viewBox`
  (`getBoundingClientRect`), donc indépendamment de la taille de rendu.
- `ShotChart` : chaque zone teintée du froid au chaud selon son pourcentage, le ratio
  `4/7` écrit dedans, les tirs en petits points (plein = marqué, creux = manqué).
  **Une zone à moins de 3 tentatives reste grise** — afficher « 100 % » sur un seul tir
  serait faux et trompeur.

## 4. Saisie — `PlayerActionDialog` et `TeamPanel`

`PlayerActionDialog` :

- Les quatre boutons 2int/2ext/3/LF laissent place à : un segmenté **Réussi | Manqué**
  (défaut Réussi), le terrain cliquable en dessous, et un bouton **Lancer franc +1**
  séparé (un lancer franc n'a pas de position).
- Un tap sur le terrain émet `SCORE` (avec `kind` déduit et `shot`) ou `MISS`, affiche un
  retour de 300 ms (« 3 PTS · aile ») puis ferme la popup.
- La section « Corriger — retirer une action » liste en plus les tirs manqués par zone.

`TeamPanel` : les raccourcis 1 clic passent de `+1 / +2 / +3 / F` à **`+1 / F`**. Tout tir
de champ passe désormais par le terrain. Garder un `+2` sans position produirait des hot
zones incomplètes donc mensongères — c'est la raison d'être de la fonctionnalité.

## 5. Calculs — `src/domain/shotchart.ts` (nouveau)

```ts
export interface Shot { spot: ShotSpot; zone: ShotZone; kind: ScoreKind; made: boolean; matchId: string }
export interface ZoneTally { made: number; attempts: number }

/** Tirs d'un joueur sur un ensemble de matchs. Un match → hot zone du match ;
 *  tous ses matchs → hot zone carrière. Même fonction, deux usages. */
export function shotsOf(matches: Match[], playerId: string): Shot[]

export function zoneSummary(shots: Shot[]): Record<ShotZone, ZoneTally>
```

`PlayerStat` (`src/domain/boxscore.ts`) gagne `attempts` et `misses`, alimentés par les
évènements `MISS` et par les paniers réussis hors lancers francs. Cela rend `fieldGoalPct`
calculable partout où le box score est déjà affiché.

**Test** — `src/domain/shotchart.test.ts` : agrégation sur deux matchs, exclusion des
lancers francs des tentatives de tir, et exclusion des tirs d'un autre joueur.

## 6. Fiche joueur — `src/ui/screens/PlayerDetail.tsx` (nouveau), route `/players/:id`

- En-tête : numéro, nom, équipe (avec lien retour vers la fiche équipe).
- Quatre cartes : matchs joués, points par match, % aux tirs, % à 3 points.
- Hot zone **carrière** en grand.
- Liste des matchs, la plus récente d'abord. Chaque ligne se déplie sur la hot zone **du
  match** et la ligne de box score correspondante.

Liens entrants : l'effectif dans `TeamDetail` et le box score de `SummaryScreen` rendent
chaque joueur cliquable.

## 7. Mode « une seule équipe »

### Création — `MatchSetup`

Une case à cocher « Je ne détaille que mon équipe ». Cochée : l'adversaire reste choisi
dans la liste (nom, badge, classement), mais son effectif n'est pas chargé
(`roster.B = []`) et `meta.solo = true`.

L'équipe suivie est **toujours le côté A**, donc marquée comme locaux. Si la rencontre se
joue à l'extérieur, le lieu (`meta.venue`) le dit ; le côté n'a pas d'autre effet.

### Écran live dédié — `src/ui/screens/SoloLiveMatch.tsx` (nouveau)

Écran distinct plutôt qu'un `LiveMatch` truffé de conditions : les deux écrans partagent
`useMatch`, `liveState`, `GameClock`, `TeamPanel`, `PlayerActionDialog` et `ShotCourt`,
mais leur mise en page n'a rien à voir.

- Scoreboard : les deux scores comme d'habitude, frise des périodes et chrono.
- Notre équipe : une seule colonne pleine largeur → grille de cartes joueurs plus large
  (2–3 colonnes). Fautes d'équipe, bonus, temps-morts, changements, périodes, fin de
  match : identiques à l'écran deux équipes.
- Adversaire : une **barre compacte** sous le scoreboard — nom, score, boutons
  `+1 / +2 / +3` et `↺` pour retirer le dernier panier. Chaque bouton émet un `SCORE`
  `team: 'B'` sans `playerId` ; `↺` retire le dernier via le prédicat
  `e.type === 'SCORE' && e.team === 'B' && !e.playerId`, exactement comme les corrections
  existantes.
- Les fautes d'équipe et temps-morts adverses ne sont pas suivis : sans eux, pas de bonus
  affiché côté adverse. C'est le prix assumé du mode.

### Aiguillage — `src/ui/screens/LiveRouter.tsx` (nouveau)

`/match/:id/live` pointe sur `LiveRouter`, qui charge le match et rend `SoloLiveMatch` ou
`LiveMatch` selon `meta.solo`. L'URL reste inchangée, donc tous les liens existants
(accueil, calendrier, fiche équipe) continuent de fonctionner sans modification.

### Cinq de départ — `StartingFiveGate`

Quand `requiredB === 0`, la colonne B n'est pas rendue et `canStart` ne dépend que du côté
A. Un seul `if` dans le composant existant, pas de variante dupliquée.

### Impact sur le reste de l'application : aucun

Le score adverse étant réel, un match solo est un match comme un autre.
`Classement`, `teamRecord`, `teamMatches`, `teamScorers`, `progression`, `totals`,
`SpectatorMatch` et l'export PDF fonctionnent **sans modification**. Seule différence
visible : le box score adverse est vide, et le PDF n'imprime donc pas de feuille pour
l'adversaire.

## 8. Données de démonstration — `src/dev/seed.ts`

Le seed génère des positions de tir plausibles (concentration raquette et corners,
quelques tirs manqués) et **au moins un match en mode solo**, pour que les hot zones et
l'écran solo soient visibles sans saisir un match à la main.

---

## Fichiers touchés

**Nouveaux** — `domain/shotzones.ts` (+ test), `domain/shotchart.ts` (+ test),
`ui/components/ShotCourt.tsx`, `ui/screens/SoloLiveMatch.tsx`, `ui/screens/LiveRouter.tsx`,
`ui/screens/PlayerDetail.tsx`.

**Modifiés** — `domain/types.ts`, `domain/boxscore.ts`,
`ui/components/PlayerActionDialog.tsx`, `ui/components/TeamPanel.tsx`,
`ui/components/StartingFiveGate.tsx`, `ui/screens/LiveMatch.tsx`,
`ui/screens/MatchSetup.tsx`, `ui/screens/SummaryScreen.tsx`, `ui/screens/TeamDetail.tsx`,
`App.tsx`, `dev/seed.ts`.

**Inchangés malgré le mode solo** — `domain/teamRecord.ts`, `domain/totals.ts`,
`domain/progression.ts`, `rules/ffbb.ts`, `ui/screens/Classement.tsx`,
`ui/screens/SpectatorMatch.tsx`, `export/*`.

## Hors périmètre

- **Lancer franc manqué.** Non demandé. À ajouter le jour où le % aux lancers francs
  compte : `MISS` accepte déjà `kind: 'lf'`, il ne manquerait qu'un bouton.
- **Rebond proposé automatiquement après un tir manqué.** Enchaînement séduisant mais qui
  ralentit la saisie et suppose que la table voit qui prend le rebond.
- **Hot zone dans l'export PDF.** Le PDF reste la feuille de marque officielle FFBB.
- **Migration des matchs existants.** Leurs tirs restent sans position : ils comptent dans
  les points, pas dans les hot zones.
