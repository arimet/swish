# Schémas offensifs 8C : le playbook

Date : 2026-08-12 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **8C** — troisième des quatre sous-projets des schémas offensifs.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 à 7 | Terrain · Club · Mono-équipe · Fiche joueur · Championnat · Vie d'équipe · Rôles | livrés |
| 8A | Le tableau tactique et son modèle | livré |
| 8B | L'animation et le lecteur du temps-mort | livré |
| **8C** | **Le playbook** (ce spec) | en cours |
| 8D | Sortie et partage : PNG, PDF, GIF, lien auto-porté | à venir |

## Objectif

8A et 8B ont livré de quoi dessiner une combinaison et la faire jouer. Une équipe
qui s'en sert vraiment en aura vingt : les systèmes en attaque placée, les remises en
jeu, les sorties de presse, les exercices d'entraînement. Une liste plate de vingt
vignettes n'est plus une bibliothèque, c'est un tas.

La référence le dit ainsi : *un playbook, pas une pile de papier*. 8C range, et
raccroche les combinaisons à la vie de l'équipe — les entraînements existent depuis
le projet 6, et c'est là qu'on travaille les systèmes.

## Les décisions de conception

**Un dossier est une étiquette, pas un tiroir.** Un schéma appartient à un dossier ou
à aucun ; il n'y a pas de sous-dossiers. Un arbre serait plus « complet » et
strictement pire : sur un téléphone, naviguer dans une arborescence pour retrouver
une combinaison au temps-mort est exactement ce qu'on veut éviter. Un seul niveau,
et l'on voit tout d'un écran.

**Les dossiers ne sont pas une entité.** Un champ `dossier?: string` sur le schéma
suffit : la liste des dossiers se déduit de ce que les schémas déclarent. Pas de
table, pas de cascade, pas de dossier vide qui traîne. Renommer un dossier, c'est
réétiqueter ses schémas ; le supprimer, c'est retirer l'étiquette — les schémas
restent, ce qui est le comportement qu'on attend et qu'on n'a pas à expliquer.

**L'attache à un entraînement va dans le sens qui a un sens.** Un entraînement porte
la liste des schémas qu'on y travaille (`playIds`), pas l'inverse : c'est ainsi qu'on
prépare une séance, et c'est la même forme que la convocation d'une rencontre, livrée
au projet 6.

## 1. Le modèle

Deux ajouts, tous deux facultatifs, aucune migration de données :

```ts
// src/domain/plays.ts
export interface Schema {
  // …
  /** Étiquette de rangement. Absent = « Sans dossier ». Un seul niveau. */
  dossier?: string
}

// src/domain/types.ts
export interface Training {
  // …
  /** Les schémas travaillés à cette séance. Sous-ensemble de la bibliothèque. */
  playIds?: string[]
}
```

`Training` gagne son champ **sans changer de version Dexie** : la table existe déjà,
et un champ facultatif ajouté à un document n'a pas besoin de migration — c'est la
même liberté que le dépôt s'est donnée depuis le début, et la raison pour laquelle
`SEED_VERSION` sert de garde plutôt qu'une migration.

**Le garde du schéma disparu** : un entraînement peut citer un schéma supprimé
depuis. Comme pour les convocations et les joueurs retirés — la faute que le projet 6
a corrigée — la lecture filtre sur ce qui existe, et `deletePlay` retire l'identifiant
des entraînements qui le citaient.

## 2. La bibliothèque range

L'écran `/schemas` gagne :

- une **barre de dossiers** : « Tous », puis un onglet par dossier existant, puis
  « Sans dossier » s'il y en a. L'onglet actif filtre la grille.
- un **champ de recherche** sur le nom et la note. Vingt combinaisons, c'est le
  moment où chercher devient plus rapide que parcourir.
- sur chaque carte, le **dossier** en pastille, et de quoi le changer.

Le dossier se saisit librement — une liste de suggestions tirée des dossiers
existants évite les doublons d'orthographe sans imposer une gestion de dossiers.

**L'ordre** : le plus récemment modifié en premier. C'est pourquoi `Schema` gagne
aussi un `majLe?: string` (date ISO), écrit à chaque enregistrement. Sans lui, l'ordre
serait celui de la base, c'est-à-dire arbitraire, et une bibliothèque de vingt
schémas paraîtrait mélangée à chaque ouverture.

## 3. L'entraînement porte ses schémas

Dans le calendrier, un entraînement peut se déplier pour y attacher des schémas —
mêmes cases à cocher que la convocation d'une rencontre. Le nombre attaché s'affiche
sur la ligne.

Sur le **tableau de bord**, le bloc « prochaine échéance » livré au projet 6 montre,
quand la prochaine échéance est un entraînement, les schémas prévus — et chacun ouvre
directement le lecteur. C'est le chemin le plus court entre « c'est mardi » et « voilà
ce qu'on travaille ».

## 4. Les droits

Ranger, renommer, attacher : `manage`. Chercher, filtrer, consulter : libre.

## 5. Les données de démonstration

Les trois schémas existants reçoivent des dossiers — « Attaque placée », « Remises en
jeu » —, un quatrième temps vient conclure le pick and roll (la relecture de 8B a
noté que sa finition n'est décrite que par des flèches et ne se joue pas), et le
prochain entraînement porte deux schémas.

## Fichiers touchés

**Modifiés** — `src/domain/plays.ts` (`dossier`, `majLe`), `src/domain/types.ts`
(`Training.playIds`), `src/persistence/repositories.ts` (`savePlay` horodate,
`deletePlay` cascade sur les entraînements), `src/ui/screens/SchemaList.tsx`
(dossiers, recherche, tri), `src/ui/screens/Calendrier.tsx` (attache),
`src/ui/screens/Dashboard.tsx` (schémas de la prochaine séance), `src/dev/seed.ts`.

## Tests

- Les dossiers se déduisent des schémas ; un dossier vidé de ses schémas disparaît
  de la barre.
- Le filtre par dossier et la recherche par nom ou note ne rendent que ce qu'il faut.
- L'ordre suit la date de modification, la plus récente en tête.
- Attacher un schéma à un entraînement l'enregistre ; décocher le retire.
- Supprimer un schéma le retire des entraînements qui le citaient.
- Un entraînement citant un schéma disparu ne casse aucun écran.
- Ranger et attacher sont refusés à la table de marque ; chercher et filtrer ne
  demandent aucun code.

## Hors périmètre

- **Les sous-dossiers**, écartés à la conception.
- **L'ordre manuel** des schémas dans un dossier : la date de modification suffit, et
  un glisser-déposer de liste est injouable au pouce.
- **Le partage et l'export** : c'est 8D.
- **Les dossiers partagés entre clubs** : l'application est mono-équipe jusqu'au
  système de locataires.
