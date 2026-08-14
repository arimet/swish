# Schémas offensifs 8D : sortie et partage

Date : 2026-08-12 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **8D** — dernier des quatre sous-projets des schémas offensifs.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 à 7 | Terrain · Club · Mono-équipe · Fiche joueur · Championnat · Vie d'équipe · Rôles | livrés |
| 8A | Le tableau tactique et son modèle | livré |
| 8B | L'animation et le lecteur du temps-mort | livré |
| 8C | Le playbook : dossiers, recherche, attache aux entraînements | livré |
| **8D** | **Sortie et partage** (ce spec) | en cours |

## Objectif

Tout ce qui a été construit vit dans l'application, sur un appareil. Or une
combinaison sert à être montrée : au vestiaire, dans le fil de discussion de
l'équipe, à un joueur absent mardi. La référence propose l'image pour le mur du
vestiaire, le PDF pour le classeur, la vidéo pour la revue, et un lien qui s'ouvre
sur n'importe quel téléphone, animation comprise.

C'est aussi le sous-projet qui lève la limite la plus gênante du modèle : les
schémas ne se synchronisent pas. Le partage par lien la contourne sans serveur.

## La décision de conception qui structure tout

**Le lien porte le schéma.** Un schéma compressé tient dans une URL ; on n'a donc
besoin d'aucun serveur, d'aucun compte, d'aucune base partagée. Le lien s'ouvre
partout, il fonctionne hors ligne une fois la page en cache, et il ne périme jamais
parce que rien n'expire côté serveur. C'est mieux qu'un hébergement, pas un pis-aller.

Le schéma part **dans le fragment** (`#…`), pas dans la requête : un fragment n'est
jamais envoyé au serveur, ne se retrouve dans aucun journal d'accès, et n'a donc pas
besoin d'être considéré comme une donnée publiée. Il n'y a rien de sensible dans une
combinaison de basket, mais c'est la bonne habitude et elle ne coûte rien.

**La compression sans dépendance.** `CompressionStream('deflate-raw')` est dans les
navigateurs depuis 2023 — Chrome, Safari 16.4, Firefox 113 —, donc aucune
bibliothèque. Le résultat est encodé en base64url. Un schéma à quatre temps avec
défense pèse quelques centaines d'octets une fois compressé : très en dessous des
limites d'URL des navigateurs et des messageries.

**Quand le lien est trop long, on le dit.** Un schéma exceptionnellement chargé
pourrait dépasser une limite raisonnable (on retient 8 000 caractères, en deçà de
toutes les limites pratiques). Dans ce cas, le partage propose l'image ou le PDF au
lieu de produire un lien qui se tronquerait en silence dans une messagerie. Un lien
cassé est pire que pas de lien.

## 1. Le codage — `src/domain/partage.ts`

```ts
/** Le schéma compressé et encodé, prêt à mettre après le `#` d'une URL. */
export function encoder(s: Schema): Promise<string>
/** L'inverse. Rend `null` sur un texte qui n'est pas un schéma valide. */
export function decoder(code: string): Promise<Schema | null>
/** Au-delà, une URL devient fragile dans les messageries. */
export const LIMITE_LIEN = 8000
```

Le codage retire ce qui n'a pas de sens ailleurs : `id`, `clubId`, `majLe`,
`dossier`. Un schéma reçu est **un schéma neuf** — il ne prétend pas être celui de
l'expéditeur, et l'importer ne peut donc écraser aucun schéma existant.

`decoder` valide **la forme** de ce qu'il lit : un lien tronqué, modifié à la main ou
issu d'une version future ne doit pas produire un objet à moitié valide que les
écrans consommeraient. Il rend `null`, et l'écran affiche un message clair.

## 2. L'écran d'accueil d'un lien — `/schemas/recu#<code>`

Hors de la coquille et **hors du garde de club** : celui qui reçoit le lien n'a
peut-être jamais ouvert l'application.

- Le schéma s'affiche, jouable — c'est le lecteur de 8B, réutilisé tel quel.
- Un bouton **« Ajouter à ma bibliothèque »**, sous `manage`, qui l'enregistre dans
  le club courant avec un nouvel identifiant. Sans club réglé, il mène d'abord au
  choix du club.
- Un lien codé illisible affiche « Ce lien est incomplet ou abîmé », pas une page
  blanche ni une erreur technique.

## 3. Les sorties fichier

**PNG** — le temps affiché, rendu à une taille lisible sur un mur (2 fois le viewBox,
soit 3000 × 2800 pour un demi-terrain). Le SVG existant est sérialisé, dessiné dans
un canvas, exporté. Fond opaque : un PNG transparent posé sur une messagerie sombre
devient illisible.

**PDF** — une page par temps, le nom et la note en tête. Écrit à la main : un PDF
d'images est un format simple, quelques centaines d'octets d'en-tête autour de nos
PNG, et cela évite une dépendance de plusieurs centaines de kilooctets pour un
besoin que l'on maîtrise entièrement.

**GIF animé** — et non MP4 : `MediaRecorder` ne produit pas de vidéo lisible partout
depuis iOS, alors qu'un GIF s'affiche dans n'importe quelle messagerie. Il est
composé à partir des instantanés de 8B, à dix images par seconde. C'est la sortie la
plus coûteuse à écrire ; si elle devait être abandonnée, ce serait au profit des
trois autres, qui couvrent déjà l'essentiel.

Toutes les sorties passent par le **partage natif** (`navigator.share`) quand il
existe — c'est le geste attendu sur un téléphone —, et retombent sur un
téléchargement sinon.

## 4. Où l'on partage

Un bouton **Partager** sur la fiche d'un schéma et dans le lecteur, qui ouvre un
choix : lien, image, PDF, GIF. Le lien est proposé en premier : c'est celui qui garde
l'animation.

## 5. Les droits

Partager et exporter : **libres**. Un joueur qui consulte doit pouvoir envoyer la
combinaison à un coéquipier ; rien n'est modifié. Seul « Ajouter à ma bibliothèque »
relève de `manage`, puisqu'il écrit.

## 6. Ce que le partage dit de ses limites

L'écran de partage rappelle en une phrase que **le lien contient le schéma** : le
recevoir suffit, il n'y a rien à installer et rien à synchroniser. C'est ce qui
explique pourquoi le lien est long, et cela évite qu'on le prenne pour un
dysfonctionnement.

## Fichiers touchés

**Créés** — `src/domain/partage.ts` et son test ; `src/ui/screens/SchemaRecu.tsx` et
son test ; `src/ui/components/ExportSchema.tsx` (le dialogue de partage et les trois
sorties fichier) et son test.

**Modifiés** — `src/App.tsx` (route `/schemas/recu`),
`src/ui/screens/SchemaView.tsx` et `src/ui/screens/SchemaPlayer.tsx` (bouton
Partager).

## Tests

- `encoder` puis `decoder` rendent un schéma équivalent à l'original, temps, flèches
  et objets compris — l'aller-retour est la propriété qui compte.
- `decoder` rend `null` sur un texte vide, tronqué, ou qui décompresse en autre chose
  qu'un schéma.
- Le codage retire `id`, `clubId`, `majLe` et `dossier`.
- Un schéma trop volumineux est signalé au-delà de `LIMITE_LIEN`, sans produire de
  lien.
- L'écran de réception affiche le schéma reçu et le rend jouable ; un lien abîmé
  affiche un message clair.
- « Ajouter à ma bibliothèque » crée un schéma **neuf** — identifiant différent — et
  est refusé à la table de marque.
- Partager et exporter ne demandent aucun code.

## Hors périmètre

- **Un serveur de partage.** Le lien auto-porté rend inutile toute infrastructure, et
  c'est le choix qui garde l'application sans compte.
- **La vidéo MP4**, écartée ci-dessus au profit du GIF.
- **L'import d'un fichier** : le lien couvre le besoin, un sélecteur de fichiers de
  plus ne l'améliorerait pas.
- **Le partage d'un dossier entier** ou de la bibliothèque : un schéma à la fois, ce
  qui correspond au geste réel — on envoie une combinaison, pas un playbook.
