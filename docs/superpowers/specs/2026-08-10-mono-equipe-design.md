# L'application devient mono-équipe

Date : 2026-08-10 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **3** de la réorientation.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 | Terrain : retour au tap, lisibilité, zones déjà tirées | livré |
| 2 | Réorientation autour d'un club et tableau de bord | livré |
| **3** | **Mono-équipe** (ce spec) | en cours |
| 4 | Fiche joueur : âge, taille, statistiques complètes | à venir |
| 5 | Championnat : saisie des résultats extérieurs, classement | à venir |
| 6 | Vie d'équipe : convocations, entraînements | à venir |
| 7 | Rôles : admin, table de marque, joueur (lecture seule) | à venir |
| 8 | Schémas offensifs | à venir, cycle propre |

## Objectif

L'application est le hub d'**une** équipe — l'Avenir de Vignot. On ne saisit jamais
l'effectif d'un adversaire : une rencontre n'est détaillée que de notre côté, le score
adverse étant saisi globalement.

Le mode « une seule équipe », introduit au projet 2 comme une option, devient donc **le
seul mode**. Ce projet supprime tout le chemin à deux équipes plutôt que de le laisser
survivre derrière un drapeau : du code qu'on ne peut plus atteindre mais qui continue de
passer les tests est un piège pour la suite.

C'est un projet qui **retire** du code. C'est son intérêt principal.

## Décisions actées

| Question | Choix |
|---|---|
| Mode deux équipes | Suppression franche — `LiveMatch`, `LiveRouter`, colonnes adverses, drapeau `solo` |
| Adversaires | Fiches équipe sans effectif : un nom, un badge, réutilisables |
| Classement | Supprimé ici. Il reviendra au projet 5, alimenté par une saisie manuelle des résultats extérieurs |
| Rencontres déjà saisies | Aucune migration : seules les données de démonstration sont concernées, le seed les réécrit |
| Onglet Rencontres | Supprimé, le calendrier le remplace |
| Calendrier | Nos rencontres uniquement |
| Barre latérale | L'effectif du club à la place de la liste des équipes |

---

## 1. Le modèle de données dit enfin la vérité

Aujourd'hui `Match.roster` a deux côtés dont un toujours vide, et `meta.teamAId` /
`teamBId` laissent croire à une symétrie qui n'existe plus.

```ts
export interface MatchMeta {
  // …
  clubId: string       // notre club — anciennement teamAId
  opponentId: string   // l'adversaire, fiche équipe sans effectif — anciennement teamBId
  // `solo` disparaît : toutes les rencontres le sont
}
export interface Match {
  id: string
  meta: MatchMeta
  roster: string[]     // notre effectif — anciennement { A, B }
  events: GameEvent[]
  status: 'setup' | 'live' | 'finished'
}
```

Conséquences dans le domaine :

- `playerStats(match)` et `playingTimes(match)` perdent leur paramètre de côté : il n'y a
  plus qu'un effectif.
- `teamTotals(match)` idem, pour notre équipe. Le total adverse se lit sur
  `liveState(match).score.b`, qui ne dépend d'aucun effectif.
- `teamRecord` perd sa fonction interne `sideOf` : notre club est désormais toujours le
  côté A par construction.

**Ce qui ne change pas** : les évènements gardent `team: 'A' | 'B'`. L'adversaire marque
des points même sans effectif, et ces points doivent bien être attribués à un côté. `A`
désigne notre club, `B` l'adversaire — c'est la seule asymétrie conservée, et elle est
réelle.

## 2. Ce qui est supprimé

**Écrans et composants**

| Fichier | Raison |
|---|---|
| `src/ui/screens/LiveMatch.tsx` | La table de marque à deux équipes n'existe plus. `SoloLiveMatch` est renommé `LiveMatch` et devient la seule. |
| `src/ui/screens/LiveRouter.tsx` | Plus d'aiguillage : il n'y a qu'un écran live. |
| `src/ui/screens/Home.tsx` | L'onglet Rencontres disparaît ; l'écran devient inatteignable. |
| `src/ui/screens/Classement.tsx` | Un classement calculé sur nos seules rencontres serait faux. Revient au projet 5. |
| `src/domain/standings.ts` | Idem. |

**Chemins morts dans les fichiers conservés**

- `StartingFiveGate` : la variante à deux colonnes et la prop `solo` — il n'y a plus qu'un
  cinq de départ à désigner.
- `SummaryScreen` et `Summary` (feuille imprimable) : le tableau adverse ; seul l'encart de
  score global subsiste, qui devient le cas normal et non plus l'exception.
- `SpectatorMatch` : idem, plus le bandeau fautes et temps-morts adverse.
- Toutes les conditions `meta.solo` : elles sont désormais toujours vraies.

## 3. Navigation

Le menu devient : **Tableau de bord · Calendrier · Effectif · Équipes**.

- « Rencontres » disparaît.
- La barre latérale liste **les joueurs du club**, par numéro, chacun menant à sa fiche.
  Les autres équipes restent accessibles par l'entrée « Équipes ».
- Le calendrier ne montre que nos rencontres et devient l'écran des matchs. Celles des
  autres équipes restent consultables depuis la fiche d'une équipe.
- La barre de navigation basse suit, quatre entrées.

## 4. Le seed

Le seed doit démontrer un hub mono-équipe, pas un championnat.

**Retiré** : les quatre équipes qui ne jouent aucune rencontre — elles ne remplissaient que
la liste des équipes de la barre latérale ; les effectifs adverses ; les rencontres entre
équipes tierces, qui n'alimentaient que le classement supprimé.

**Conservé** : Vignot, ses cinq adversaires, et nos cinq rencontres — trois terminées, une
en direct, une à venir.

**Ajouté — et c'est le point important.** Le seed ne contient **aucun changement de
joueur**. Or le temps de jeu, que le projet 4 doit afficher, se calcule à partir d'eux.
Sans `SUBSTITUTION`, le cinq de départ afficherait quarante minutes pleines et tout le banc
zéro : une statistique fausse dès son premier affichage. Le seed reçoit donc des rotations
réalistes.

Les statistiques secondaires sont également étoffées : avec sept évènements par rencontre,
les moyennes par match du projet 4 tourneraient autour de 0,2.

---

## Fichiers touchés

**Supprimés** — `ui/screens/LiveMatch.tsx`, `ui/screens/LiveRouter.tsx`,
`ui/screens/Home.tsx`, `ui/screens/Classement.tsx`, `domain/standings.ts` et leurs tests.

**Renommé** — `ui/screens/SoloLiveMatch.tsx` → `ui/screens/LiveMatch.tsx`.

**Modifiés** — `domain/types.ts`, `domain/boxscore.ts`, `domain/totals.ts`,
`domain/playingtime.ts`, `domain/teamRecord.ts`, `domain/progression.ts` (si concerné),
`rules/ffbb.ts`, `ui/components/StartingFiveGate.tsx`, `ui/screens/SummaryScreen.tsx`,
`ui/screens/Summary.tsx`, `ui/screens/SpectatorMatch.tsx`, `ui/screens/MatchSetup.tsx`,
`ui/screens/MatchPreview.tsx`, `ui/screens/Dashboard.tsx`, `ui/screens/TeamDetail.tsx`,
`ui/screens/Calendrier.tsx`, `ui/olive/kit.tsx`, `ui/olive/OliveShell.tsx`, `App.tsx`,
`dev/seed.ts`.

## Tests

- `playerStats`, `playingTimes`, `teamTotals` fonctionnent sans paramètre de côté.
- Un panier adverse compte au score sans apparaître dans aucune ligne de joueur — garantie
  déjà couverte, à préserver après le changement de modèle.
- Le calendrier n'affiche que les rencontres du club.
- La barre latérale liste les joueurs du club et non les équipes.
- Le seed produit des `SUBSTITUTION`, et le temps de jeu qui en découle n'est ni nul pour
  le banc ni maximal pour tous les titulaires.
- Aucune référence résiduelle à `meta.solo`, `roster.A`, `roster.B`, `teamAId`, `teamBId`
  ne subsiste dans `src/`.

## Hors périmètre

- **Le multi-équipes.** Rien à faire maintenant : le club est déjà un réglage, les
  adversaires sont déjà des fiches. Le jour venu, c'est la couche de synchronisation qui
  portera le locataire, pas les écrans.
- **Le classement**, qui revient au projet 5 avec la saisie des résultats extérieurs.
- **Toute nouvelle statistique** : ce projet ne fait que retirer et renommer. La fiche
  joueur enrichie est le projet 4.
