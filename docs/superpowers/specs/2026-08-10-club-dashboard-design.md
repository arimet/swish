# Réorientation autour d'un club et tableau de bord

Date : 2026-08-10 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **2 sur 3** de la réorientation de l'application.

## Où l'on en est

L'application vise désormais **un club** — l'Avenir de Vignot — qui veut exploiter ses
données. Le classement et les autres équipes deviennent du contexte utile, pas le cœur.

| # | Projet | État |
|---|---|---|
| 1 | Terrain : retour au tap, lisibilité, zones déjà tirées | **livré** |
| **2** | **Réorientation et tableau de bord** (ce spec) | en cours |
| 3 | Rôles : admin, table de marque, joueur | à venir |

## Objectif

Aujourd'hui l'application traite les dix équipes de la poule à égalité. Ouvrir l'app
affiche toutes les rencontres du championnat, et rien ne distingue son club des autres.
Ce projet inverse la hiérarchie : on ouvre sur l'état de **son** équipe, le championnat
devient une section secondaire.

## Décisions actées

| Question | Choix |
|---|---|
| Désignation du club | Réglage local, choisi à un écran de bienvenue au premier lancement |
| Tableau de bord | Devient la page d'accueil (`/`) |
| Portée | Saison, avec le match en cours en tête |
| Championnat | Relégué dans une section du menu, rien n'est supprimé |
| Contenu de la v1 | Bandeau match · bilan et forme · marqueurs et réussite · hot zones |

---

## 1. Mon club — `src/app/club.ts` (nouveau)

Un contexte React sur le modèle exact de `src/app/admin.tsx`, qui utilise déjà ce patron
pour le déverrouillage administrateur.

```ts
export function ClubProvider({ children }: { children: ReactNode })
export function useClub(): { clubId: string | null; setClub: (id: string) => void; clear: () => void }
```

L'identifiant est stocké dans `localStorage` sous la clé `swish-club-id`.

**Pourquoi `localStorage` et non la base synchronisée** : c'est une préférence d'appareil,
au même titre que le déverrouillage admin. Deux personnes du même club partagent les
mêmes matchs mais pas forcément le même appareil ; et un club qui prêterait sa tablette à
l'adversaire n'a aucune raison de lui pousser son réglage. Rien de tout cela n'a sa place
dans le document de championnat.

**Club supprimé.** Si l'identifiant enregistré ne correspond plus à aucune équipe — équipe
supprimée depuis un autre appareil — `useClub` doit se comporter comme si aucun club
n'était choisi, et l'écran de bienvenue reprend la main. Sans ce garde, l'application
resterait bloquée sur un tableau de bord vide sans moyen d'en sortir.

## 2. Écran de bienvenue — `src/ui/screens/Welcome.tsx` (nouveau)

Affiché tant qu'aucun club valide n'est choisi, **à la place du shell** : ce n'est pas une
route dont on peut s'échapper, c'est l'état initial de l'application.

- Titre, une phrase d'explication, et la liste des équipes existantes à choisir.
- Aucune équipe en base : un lien vers la création d'équipe, car choisir dans une liste
  vide n'a pas de sens.

Le choix est modifiable ensuite depuis une entrée discrète en bas du menu latéral, qui
rouvre la même sélection.

## 3. Le menu, recentré — `src/ui/olive/OliveShell.tsx`

| Aujourd'hui | Demain |
|---|---|
| Rencontres (`/`) · Calendrier · Équipes · Classement | **Tableau de bord** (`/`) · **Mon équipe** — puis section **Championnat** : Rencontres · Calendrier · Classement · Équipes |

- « Mon équipe » pointe sur `/teams/<clubId>`, la fiche existante qui liste déjà l'effectif
  et les rencontres. **Aucun écran n'est créé pour cela.**
- L'accueil actuel — toutes les rencontres avec ses onglets et sa frise de dates — n'est
  pas supprimé : il descend sur `/rencontres`, sous Championnat. Seule sa route change.
- La liste des dix équipes dans la barre latérale se réduit : le club en tête, mis en
  évidence, les autres sous la section Championnat.
- La barre de navigation basse (mobile) suit la même hiérarchie, limitée à quatre entrées
  pour rester utilisable au pouce.

## 4. Le tableau de bord — `src/ui/screens/Dashboard.tsx` (nouveau), route `/`

Quatre blocs.

**Bandeau.** Si un match du club est en cours : score vivant, période, chrono, et bouton
vers la table de marque. Sinon la prochaine rencontre planifiée, avec date, heure, lieu et
adversaire. Sinon un appel à créer une rencontre.

**Bilan et forme.** Victoires/défaites, points marqués et encaissés par match,
différentiel, les cinq derniers résultats en pastilles V/D, et la place du club au
classement. Tout cela vient de `teamRecord` et `teamMatches`, déjà écrits et testés.

**Marqueurs et réussite.** Les meilleurs marqueurs du club avec leur pourcentage de
réussite aux tirs et leur nombre de rencontres, chaque joueur cliquable vers sa fiche.
`teamScorers` existe ; la réussite vient de `shootingPct(shotsOf(matches, playerId))`.

**Hot zones.** La carte de chaleur de tout le club sur la saison, et celle du joueur
sélectionné. Les tirs du club sont l'agrégat de ceux de son effectif :
`roster.flatMap((id) => shotsOf(matches, id))`. Aucun nouveau calcul de domaine.

## 5. Extraction du classement — `src/domain/standings.ts` (nouveau)

Le calcul du classement vit aujourd'hui **dans** `src/ui/screens/Classement.tsx`, en
fonction locale non exportée. Le tableau de bord a besoin de la place du club.

Cette fonction migre dans `src/domain/standings.ts`, et les deux écrans l'utilisent. Un
second exemplaire de la règle « victoire = 2 points, défaite = 1 point » divergerait du
premier au premier ajustement de barème, et deux écrans afficheraient alors des classements
différents pour la même saison.

```ts
export interface StandingLine { id: string; name: string; j: number; v: number; d: number; pf: number; pa: number; pts: number }
export function standings(matches: Match[], teams: Record<string, Team>): { champ: string; lines: StandingLine[] }[]
/** Place du club dans son championnat. `null` si aucune rencontre terminée. */
export function clubStanding(matches: Match[], teams: Record<string, Team>, clubId: string): { rank: number; total: number; line: StandingLine } | null
```

L'extraction doit être un **déplacement à l'identique** : le comportement du classement ne
change pas dans ce projet. Un test le vérifie sur les données de démonstration.

---

## Fichiers touchés

**Créés** — `src/app/club.ts`, `src/ui/screens/Welcome.tsx`, `src/ui/screens/Dashboard.tsx`,
`src/domain/standings.ts` (+ son test).

**Modifiés** — `src/App.tsx` (routes, `ClubProvider`, garde de bienvenue),
`src/ui/olive/OliveShell.tsx` (menu, navigation mobile, entrée de réglage),
`src/ui/screens/Classement.tsx` (utilise `standings` extrait), `src/dev/seed.ts` (pré-régler
le club de démonstration sur l'Avenir de Vignot).

**Inchangés** — `src/ui/screens/Home.tsx` : seule sa route change, pas son contenu.

## Tests

- `standings` extrait produit exactement le même classement qu'avant l'extraction.
- `clubStanding` renvoie la bonne place, et `null` quand aucune rencontre n'est terminée.
- Sans club choisi, l'application affiche l'écran de bienvenue et non le tableau de bord.
- Un identifiant de club qui ne correspond plus à aucune équipe ramène à l'écran de
  bienvenue.
- Le tableau de bord affiche le bandeau du match en cours quand il y en a un, la prochaine
  rencontre sinon.
- Un club sans aucun tir localisé n'affiche pas une hot zone vide sans explication.

## Hors périmètre

- **Graphiques d'évolution match par match** et **comparaison avec les autres équipes** :
  à ajouter quand une saison aura été vécue avec la version simple.
- **Temps de jeu cumulé sur le tableau de bord** : `playingTimes` existe, mais la donnée
  n'a de sens qu'agrégée sur plusieurs matchs, ce qui demande un calcul nouveau.
- **Export du tableau de bord.**
- **Plusieurs clubs suivis simultanément** (seniors, U18) : le réglage est unique. Le jour
  où ce sera nécessaire, `club.ts` est le seul fichier à faire évoluer.
