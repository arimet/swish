# La fiche joueur complète

Date : 2026-08-10 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **4** de la réorientation.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 | Terrain : retour au tap, lisibilité, zones déjà tirées | livré |
| 2 | Réorientation autour d'un club et tableau de bord | livré |
| 3 | Mono-équipe : suppression du mode deux équipes | livré |
| **4** | **Fiche joueur** (ce spec) | en cours |
| 5 | Championnat : saisie des résultats extérieurs, classement | à venir |
| 6 | Vie d'équipe : convocations, entraînements | à venir |
| 7 | Rôles : admin, table de marque, joueur | à venir |
| 8 | Schémas offensifs | à venir, cycle propre |

## Objectif

La fiche joueur n'affiche aujourd'hui que les points, la réussite aux tirs et les hot
zones. Or l'application enregistre depuis le début les passes décisives, les rebonds, les
contres, les fautes, la répartition des paniers, et — depuis que le seed contient des
rotations — le temps de jeu. Tout cela existe en base et n'est visible nulle part.

Ce projet donne à voir ce qui est déjà enregistré, et ajoute deux informations
signalétiques : la date de naissance et la taille.

## Décisions actées

| Question | Choix |
|---|---|
| Âge | **Calculé** à l'affichage depuis une date de naissance stockée. Un âge enregistré en dur devient faux au premier anniversaire |
| Saisie | Dans l'effectif de la fiche équipe, deux champs optionnels — plus l'édition en place des joueurs existants |
| Statistiques | Passes, rebonds, contres · répartition des paniers · fautes et temps de jeu · ligne complète par rencontre |
| Poste et latéralité | Écartés |

---

## 1. Deux champs signalétiques

```ts
export interface Player {
  id: string; teamId: string; number: number
  lastName: string; firstName: string; license?: string
  /** Date de naissance au format ISO `AAAA-MM-JJ`. L'âge s'en déduit à l'affichage. */
  birthDate?: string
  /** Taille en centimètres. */
  height?: number
}
```

Les deux sont **optionnels** : les blocs correspondants n'apparaissent sur la fiche que
s'ils sont renseignés. Un effectif existant reste parfaitement valide sans eux, et aucune
migration n'est nécessaire — ce sont des documents Dexie, pas un schéma.

### Le point que la demande implique sans le dire

Le formulaire d'effectif ne fait aujourd'hui qu'**ajouter** des joueurs ; il n'en modifie
aucun. Sans édition, renseigner la date de naissance d'un joueur déjà enregistré
imposerait de le supprimer et de le recréer — donc de lui donner un nouvel identifiant, et
de perdre tout son historique de tirs et de statistiques.

L'édition en place de ces deux champs fait donc partie du projet, sinon la fonctionnalité
n'est utilisable que pour les joueurs à venir.

## 2. Les cumuls de carrière — `src/domain/career.ts` (nouveau)

```ts
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

/** Cumuls d'un joueur sur les rencontres où il figure à l'effectif et qui ont commencé. */
export function playerCareer(matches: Match[], playerId: string): CareerTotals

/** Âge révolu à une date donnée. La date de référence est un paramètre : un âge
 *  calculé sur l'horloge du moment rendrait tout test dépendant du jour où il tourne. */
export function ageAt(birthDate: string, at: Date): number
```

`playerCareer` s'appuie sur `playerStats(match)` et `playingTimes(match)`, tous deux déjà
écrits, testés, et débarrassés de leur paramètre de côté par le projet précédent. Aucun
nouveau parcours du journal d'évènements.

**Pourquoi un module de domaine et non un calcul dans le composant** : c'est une agrégation
sur N rencontres avec des règles — quelles rencontres comptent, comment se cumule le temps
de jeu — qui mérite d'être testée sans monter de React.

## 3. La fiche joueur

**Identité.** Numéro, nom, équipe, et deux blocs supplémentaires **seulement s'ils sont
renseignés** : l'âge, calculé, et la taille. Un joueur sans ces informations garde la fiche
d'aujourd'hui, sans trou visible.

**Cartes de synthèse.** Rencontres jouées, points par match, réussite aux tirs, réussite à
3 points — comme aujourd'hui — plus le **temps de jeu moyen**. Douze points en huit minutes
n'est pas douze points en trente-cinq.

**Statistiques complètes**, en cumul et en moyenne par match : passes décisives, rebonds
offensifs et défensifs, contres, fautes, et la répartition des paniers — 2 points
intérieurs, 2 points extérieurs, 3 points, lancers francs.

**Historique.** Chaque rencontre dépliée montre déjà sa hot zone ; elle montre désormais
aussi la **ligne complète du joueur ce jour-là** — points, tirs, passes, rebonds, contres,
fautes, temps de jeu — à côté de la carte.

Une moyenne s'affiche avec une décimale : « 3,4 passes par match » a un sens que « 3 » n'a
pas. Une statistique absente s'affiche `—`, jamais `0`.

## 4. Les données de démonstration

Le seed reçoit des dates de naissance et des tailles pour l'effectif de Vignot — sinon les
blocs signalétiques n'auraient rien à montrer et la fonctionnalité paraîtrait absente.

Des âges plausibles pour une équipe senior, des tailles cohérentes avec les numéros.

---

## Fichiers touchés

**Créés** — `src/domain/career.ts` et son test.

**Modifiés** — `src/domain/types.ts` (deux champs), `src/ui/screens/TeamDetail.tsx`
(saisie et édition), `src/ui/screens/PlayerDetail.tsx` (l'essentiel de l'affichage),
`src/dev/seed.ts` (données de démonstration).

## Tests

- `ageAt` donne l'âge révolu, y compris la veille et le jour de l'anniversaire.
- `playerCareer` cumule sur plusieurs rencontres, ignore celles où le joueur n'est pas à
  l'effectif, et n'en compte aucune quand il n'a jamais joué.
- Le temps de jeu cumulé correspond à la somme des temps par rencontre.
- La fiche affiche l'âge et la taille quand ils sont renseignés, et **ne laisse aucun bloc
  vide** sinon.
- L'édition en place d'une date de naissance conserve l'identifiant du joueur — donc son
  historique.
- Une moyenne par match s'affiche avec une décimale.

## Hors périmètre

- **Poste et latéralité** : écartés à la conception.
- **Comparaison entre joueurs** et **découpage par saison** : le jour où il y aura deux
  saisons en base.
- **Graphiques d'évolution match par match** : la liste des rencontres suffit pour l'instant.
