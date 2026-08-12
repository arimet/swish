# Schémas offensifs 8A : le tableau tactique et son modèle

Date : 2026-08-12 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **8A** — premier des quatre sous-projets des schémas offensifs.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 à 7 | Terrain · Club · Mono-équipe · Fiche joueur · Championnat · Vie d'équipe · Rôles | livrés |
| **8A** | **Le tableau tactique et son modèle** (ce spec) | en cours |
| 8B | L'animation : lecture, boucle, ralenti, lecteur plein écran | à venir |
| 8C | Le playbook : dossiers, vignettes, attache aux entraînements | à venir |
| 8D | Sortie et partage : PNG, PDF, GIF, lien auto-porté | à venir |

## Objectif

Le coach dessine ses combinaisons au tableau blanc, les photographie, et les perd.
Ce projet lui donne un tableau tactique dans l'application : le même demi-terrain que
la carte des tirs, les cinq attaquants, la défense s'il la veut, le ballon, et des
trajectoires tracées au doigt. La référence d'ambition est Coach Tactic Board
(bluelinden) ; 8A en livre le socle — le tableau et le modèle de données sur lesquels
l'animation (8B), le playbook (8C) et le partage (8D) viendront se poser.

## Les décisions qui structurent tout

**Un schéma est une suite de temps.** Chaque temps porte les positions complètes des
pions, le ballon et ses flèches. C'est le modèle mental du coach — « premier temps,
l'ailier coupe » — et chaque temps se lit, se réordonne et se supprime seul. En 8B,
ces temps deviendront les images clés de l'animation : rien du modèle n'est jetable.

**Les pions sont des postes, pas des joueurs.** Une combinaison survit à un départ en
fin de saison. Cinq attaquants numérotés 1 à 5, et cinq défenseurs en croix ×1 à ×5
quand le schéma le demande.

**Une trajectoire est une liste de points.** Le doigt trace ; le geste est
échantillonné puis réduit à une poignée de points, lissés au rendu. Un tracé raté se
supprime et se refait — pas de poignées de contrôle, impossibles à attraper au doigt
sur un téléphone. Une liste de points se stocke en JSON, se compare dans un test, et
se compressera bien quand 8D mettra un schéma dans une URL.

**Le terrain complet est le demi-terrain redoublé.** Le demi-terrain FIBA en place
mesure 15 × 14 m ; le terrain complet 15 × 28 : mêmes tracés, retournés, dans le même
repère normalisé. Une seule géométrie, et les coordonnées existantes restent valables.
Le terrain complet se tient en portrait, comme le téléphone.

## 1. Le modèle — `src/domain/plays.ts`

```ts
export type Terrain = 'demi' | 'complet'
export type Camp = 'attaque' | 'defense'
export type Poste = 1 | 2 | 3 | 4 | 5
export type Trait = 'course' | 'ecran' | 'passe' | 'dribble'
export interface Point { x: number; y: number }   // normalisés 0..1 dans le terrain choisi

export interface Pion { camp: Camp; poste: Poste; at: Point }

/** Points échantillonnés du geste, lissés au rendu. Le dernier porte la pointe
 *  (ou la barre en T pour un écran). */
export interface Fleche { depuis: { camp: Camp; poste: Poste }; points: Point[]; trait: Trait }

export interface Temps {
  pions: Pion[]                                   // 5 ou 10 selon `defense`
  ballon: { camp: Camp; poste: Poste } | Point    // porté par un pion, ou posé au sol
  fleches: Fleche[]
}

export interface ObjetPose { sorte: 'plot' | 'ballon' | 'echelle'; at: Point }

export interface Schema {
  id: string
  clubId: string
  nom: string
  note?: string
  terrain: Terrain
  defense: boolean
  objets: ObjetPose[]                             // communs à tous les temps
  temps: Temps[]                                  // au moins un
}
```

Trois choix défendus :

- **Le ballon est porté ou posé.** Sans le ballon posé, ni remise en jeu ni exercice
  qui commence balle au sol ne se dessinent.
- **Les objets sont communs à tous les temps.** Un plot ne bouge pas pendant
  l'exercice ; le répéter par temps obligerait à le garder synchronisé pour rien.
- **Chaque temps est complet**, jamais un écart sur le précédent : corriger le
  premier temps ne déplace pas les suivants, et aucun temps ne peut devenir
  incohérent.

Les fonctions pures du domaine :

- `nouveauSchema(clubId, terrain, defense)` — un temps initial en 1-2-2 (et une
  défense en miroir, plus proche du panier, si demandée) ; sur terrain complet, la
  mise en place occupe la moitié avant.
- `tempsSuivant(t: Temps)` — copie les pions et le ballon, **jamais les flèches**.
  C'est la décision qui fait ou défait l'ergonomie : le coach fait glisser les pions
  là où ses flèches les envoyaient, il ne replace pas cinq pions à chaque temps.
- `reduireTrace(points: Point[]): Point[]` — réduit un geste de centaines de points à
  une poignée **sans perdre la forme** (Ramer-Douglas-Peucker ou équivalent) : un
  tracé en L garde son coude.
- `versTerrain(s: Schema, terrain: Terrain): Schema | { refus: string }` —
  demi → complet remappe dans la moitié avant, sans perte ; complet → demi est
  **refusé** tant qu'un pion, une flèche ou un objet occupe la moitié arrière, avec
  un message qui dit lequel. Remapper en silence perdrait la moitié du dessin.

## 2. La persistance

Table Dexie `plays: 'id, clubId'` en **version 5** du schéma. Les versions
précédentes ne sont pas touchées.

Comme les résultats, les convocations et les entraînements, les schémas **ne passent
pas par la file de synchronisation** : ils restent sur l'appareil, la limite est la
même et les écrans le disent avec la même phrase. `deleteTeam` cascade sur les
schémas du club.

## 3. L'éditeur — `/schemas/:id/edit`

Le terrain occupe le maximum de l'écran, la barre d'outils au-dessus, la bande des
temps en dessous.

**La barre d'outils** : Déplacer (mode par défaut) · Course · Écran · Passe ·
Dribble · Ballon · Objets · Gomme.

- **Déplacer** : glisser un pion ou un objet le déplace. Les positions sont bornées
  au terrain.
- **Course / Écran / Passe / Dribble** : on tire depuis un pion ; le geste est
  capturé, échantillonné, réduit par `reduireTrace`. Le rendu suit les conventions du
  carnet : course en trait plein, écran terminé par une barre en T, passe en
  pointillé, dribble ondulé. Une flèche qui ne part pas d'un pion est ignorée.
- **Ballon** : un tap sur un pion le lui donne ; un tap sur le terrain le pose au sol.
- **Objets** : plot, ballon, échelle — posés d'un tap, déplacés en mode Déplacer.
- **Gomme** : un tap sur une flèche ou un objet le supprime.

**Annuler** : une pile d'annulation par temps, bouton visible. Un éditeur de dessin
sans « annuler » est inutilisable — ce n'est pas un raffinement.

**La bande des temps** : chaque temps en vignette, « + » ajoute `tempsSuivant` du
dernier. Le réordonnancement se fait par deux boutons ◀ ▶ sur le temps sélectionné —
pas de glisser-déposer de liste, injouable au pouce et pénible à tester. Suppression
possible sauf du dernier temps restant.

**L'en-tête** : nom, note, terrain (demi/complet, via `versTerrain` et son refus
expliqué), défense (l'activer ajoute les cinq croix en miroir ; la désactiver les
retire ainsi que leurs flèches, après confirmation).

Le rendu du terrain réutilise la géométrie et le style de `ShotCourt` ; le composant
terrain de schéma vit dans `src/ui/components/PlayBoard.tsx`, séparé de la carte des
tirs qu'il ne doit pas alourdir.

## 4. La bibliothèque — `/schemas`

Une entrée « Schémas » dans le menu. La liste des schémas du club, chacun avec une
**vignette du premier temps** — un coach reconnaît sa combinaison à sa forme, pas à
son nom. Créer, dupliquer, supprimer. La consultation d'un schéma (`/schemas/:id`)
montre les temps qu'on fait défiler à la main — le lecteur plein écran animé est
l'objet de 8B.

## 5. Les droits

Créer, modifier, supprimer : `manage`. La lecture est libre — un joueur revoit la
combinaison chez lui sans code, conformément à l'invariant du projet 7.

## 6. Les données de démonstration

Trois schémas : un pick and roll haut (3 temps, défense), un corner pour le poste 4
(2 temps, sans défense), une remise en jeu ligne de fond sur terrain complet
(2 temps, ballon posé puis porté). De quoi voir la bibliothèque remplie et chaque
variante du modèle exercée sans rien saisir.

## Fichiers touchés

**Créés** — `src/domain/plays.ts` et son test ; `src/ui/components/PlayBoard.tsx` ;
`src/ui/screens/SchemaList.tsx`, `src/ui/screens/SchemaEdit.tsx` et leurs tests.

**Modifiés** — `src/persistence/db.ts` (version 5) — les types du schéma vivent dans
`src/domain/plays.ts`, `types.ts` n'est pas touché —, `src/persistence/repositories.ts` (CRUD + cascade `deleteTeam`),
`src/App.tsx` (routes), `src/ui/olive/OliveShell.tsx` (entrée de menu),
`src/dev/seed.ts` (démo, `SEED_VERSION` incrémenté).

## Tests

Sans écran, dans `plays.test.ts` :

- `tempsSuivant` hérite des positions et du ballon, jamais des flèches.
- `nouveauSchema` : 1-2-2 sur demi-terrain ; défense en miroir plus proche du panier ;
  moitié avant sur terrain complet.
- `reduireTrace` : un tracé en L garde son coude ; un geste de 200 points descend
  sous une dizaine ; un tracé de moins de trois points reste tel quel.
- `versTerrain` : demi → complet sans perte ; complet → demi refusé avec le motif
  quand la moitié arrière est occupée, accepté sinon.

Par écran :

- Tracer une flèche l'enregistre ; la gomme la retire ; annuler restaure.
- « + » ajoute un temps qui hérite des positions, pas des flèches.
- La table de marque se voit refuser la création d'un schéma (code admin nommé) ;
  un visiteur consulte la bibliothèque et un schéma sans qu'aucun code soit demandé.
- La suppression d'une équipe emporte ses schémas.

## Hors périmètre — pour les sous-projets suivants

- **L'animation** (8B) : interpolation entre les temps le long des flèches, lecture,
  boucle, ralenti, lecteur plein écran du temps-mort.
- **Le playbook** (8C) : dossiers, attache aux entraînements (`Training.playIds`).
- **La sortie** (8D) : PNG, PDF, GIF animé, lien auto-porté qui s'ouvre partout.
- La synchronisation de ces données, comme pour les résultats du championnat.
- Les poses de joueurs dessinées (les 120 poses de la référence) : des pions
  numérotés lisibles valent mieux que des silhouettes à cette taille d'écran.
