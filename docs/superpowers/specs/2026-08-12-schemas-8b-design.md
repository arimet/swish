# Schémas offensifs 8B : l'animation et le lecteur du temps-mort

Date : 2026-08-12 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **8B** — deuxième des quatre sous-projets des schémas offensifs.

## Où l'on en est

| # | Projet | État |
|---|---|---|
| 1 à 7 | Terrain · Club · Mono-équipe · Fiche joueur · Championnat · Vie d'équipe · Rôles | livrés |
| 8A | Le tableau tactique et son modèle | livré |
| **8B** | **L'animation et le lecteur** (ce spec) | en cours |
| 8C | Le playbook : dossiers, vignettes, attache aux entraînements | à venir |
| 8D | Sortie et partage : PNG, PDF, GIF, lien auto-porté | à venir |

## Objectif

8A a livré un tableau où l'on fait défiler des temps à la main. C'est déjà un carnet
de coach ; ce n'est pas encore ce qui fait la valeur d'un tableau tactique
électronique. La référence — Coach Tactic Board — laisse **jouer la possession** :
les pions glissent, l'écran arrive au bon moment, on voit où le porteur d'écran
plonge. C'est ce que 8B ajoute, plus l'écran qui sert au moment où ça compte : les
soixante secondes d'un temps-mort.

## La décision de conception qui structure tout

**La flèche est un dessin, pas une trajectoire.** C'est le constat de la relecture
d'ensemble de 8A, et il faut le prendre au sérieux : rien dans le modèle ne relie le
bout d'une flèche à la position du pion au temps suivant. La convention est tenue à
la main dans les données de démonstration, pas garantie par le type.

Deux conséquences, qui décident de tout :

1. **L'animation interpole entre les positions des temps**, jamais le long de la
   flèche seule. Position de départ : le pion au temps N. Position d'arrivée : le
   même pion au temps N+1. C'est la seule paire dont le modèle garantisse la
   cohérence.
2. **La flèche sert à courber le trajet**, quand il y en a une. Son tracé est
   reparamétré pour partir de la position réelle au temps N et aboutir à la position
   réelle au temps N+1 — une transformation affine du tracé, qui préserve la forme du
   geste (le contournement d'un écran, la coupe en backdoor) tout en garantissant que
   le pion arrive où il doit.

Sans flèche, le pion va en ligne droite. C'est le cas courant et il doit être le
comportement par défaut, pas un cas d'erreur.

**Le ballon suit une règle à part.** Une flèche `passe` déplace le ballon, pas le
joueur : le passeur reste, le ballon file. On distingue donc, pour chaque transition,
ce qui anime un pion (`course`, `ecran`, `dribble`) de ce qui anime le ballon
(`passe`). Quand le ballon change de porteur d'un temps au suivant sans flèche de
passe, il va tout de même du premier au second — sinon il se téléporterait.

## 1. Le domaine de l'animation — `src/domain/anim.ts`

Une fonction pure, testable sans écran, qui répond à une seule question : **où est
chaque chose à l'instant `t` ?**

```ts
/** Avancement dans la combinaison : `temps` est le rang du temps de départ,
 *  `part` la fraction parcourue vers le temps suivant (0 à 1). */
export interface Instant { temps: number; part: number }

/** L'état figé d'un schéma à un instant donné : de quoi rendre un `Temps`. */
export function instantane(s: Schema, at: Instant): Temps

/** Nombre de transitions animables — un schéma à trois temps en a deux. */
export const transitions = (s: Schema) => Math.max(0, s.temps.length - 1)
```

`instantane` rend un `Temps` complet, directement consommable par le `PlayBoard` de
8A : aucune modification du rendu n'est nécessaire, l'animation est une suite
d'états. C'est ce qui rend le sous-projet petit.

Les règles qu'il applique :

- **Pions** : interpolation entre la position au temps N et celle au temps N+1. Si
  une flèche de déplacement part de ce pion, le trajet suit le tracé recalé (voir
  §2) ; sinon, ligne droite.
- **Ballon** : porté, il suit son porteur. Si une flèche `passe` part du porteur, le
  ballon parcourt ce tracé et arrive au porteur du temps N+1. Si le porteur change
  sans flèche, ligne droite entre les deux. Posé au sol, il ne bouge pas — sauf s'il
  est pris en main au temps suivant, auquel cas il rejoint son nouveau porteur.
- **Flèches** : l'instantané n'en porte aucune. Pendant l'animation, on voit les
  joueurs bouger, pas les traits qui décrivent le mouvement — les afficher en même
  temps sature l'image et c'est précisément ce que l'animation remplace. Elles
  reviennent dès la pause.
- **Objets** : immobiles par construction.

Le pion sur lequel aucune flèche ne porte et qui ne bouge pas entre deux temps reste
strictement immobile : aucune interpolation ne doit le faire trembler.

## 2. Le recalage d'un tracé — `recaler(points, depart, arrivee)`

Une flèche a été dessinée à la main ; ses extrémités ne coïncident pas exactement
avec les positions des temps. Le recalage applique au tracé la similitude — rotation,
échelle, translation — qui envoie son premier point sur `depart` et son dernier sur
`arrivee`. La forme du geste est préservée ; les extrémités deviennent exactes.

C'est une fonction pure de quelques lignes, et c'est le cœur testable du
sous-projet : un tracé en L recalé reste un L, et ses deux bouts tombent où il faut.

Cas limite : un tracé dont les deux extrémités sont confondues n'a pas de similitude
définie — on retombe alors sur la ligne droite.

## 3. Le lecteur plein écran — `/schemas/:id/lecteur`

L'écran du temps-mort, **hors de la coquille** : pas de barre latérale, pas de menu,
pas de titre d'application. Le terrain occupe tout ce qu'il peut.

- Le nom du schéma, discret, en haut.
- **Deux zones tactiles occupant chacune une moitié de l'écran** pour reculer et
  avancer d'un temps. Au temps-mort on ne vise pas un bouton de quarante pixels.
- Un bouton **Lecture** qui joue la combinaison d'un bout à l'autre.
- **Boucle** et **ralenti** : deux interrupteurs. La boucle repart du premier temps ;
  le ralenti divise la vitesse par deux. Ce sont les deux réglages que la référence
  offre et les seuls qu'un coach utilise réellement.
- Une **barre d'avancement** qui montre où l'on en est et qu'on peut faire glisser
  pour se placer n'importe où dans la combinaison.
- Sortie par un bouton clairement visible — un écran plein sans sortie évidente est
  un piège.

La lecture est libre : aucun code n'est demandé, jamais. Un joueur ouvre le lecteur
chez lui.

Le lecteur est atteignable depuis la consultation d'un schéma et depuis sa carte dans
la bibliothèque.

## 4. La cadence

Une transition dure **une seconde et demie**, deux fois plus au ralenti. La valeur
n'est pas configurable : un réglage de plus pour un bénéfice nul, et 1,5 s est la
durée qui laisse lire un mouvement sans qu'on s'impatiente sur un schéma à quatre
temps.

L'animation s'appuie sur `requestAnimationFrame` et se met en pause quand l'onglet
passe à l'arrière-plan — sur un téléphone, une animation qui continue en arrière-plan
vide la batterie et se retrouve à un endroit imprévu au retour.

**Le respect de `prefers-reduced-motion`** : quand le système le demande, la lecture
saute d'un temps au suivant sans interpolation. Ce n'est pas une option de confort,
c'est la seule façon correcte de traiter quelqu'un que le mouvement dérange.

## 5. Ce que 8B ne change pas

Le modèle de 8A n'est pas touché : aucun champ ajouté, aucune migration Dexie.
L'animation se déduit de ce qui est déjà enregistré. C'est la vérification que le
socle de 8A était le bon.

## Fichiers touchés

**Créés** — `src/domain/anim.ts` et son test ; `src/ui/screens/SchemaPlayer.tsx` et
son test.

**Modifiés** — `src/App.tsx` (route hors coquille), `src/ui/screens/SchemaView.tsx`
et `src/ui/screens/SchemaList.tsx` (entrées vers le lecteur).

## Tests

Sans écran, dans `anim.test.ts` :

- `instantane` à `part = 0` rend exactement le temps N ; à `part = 1`, exactement le
  temps N+1.
- Un pion immobile entre deux temps ne bouge pas à mi-chemin.
- Un pion muni d'une flèche de course passe par la forme du tracé, pas par la corde :
  à mi-chemin, il est à l'écart de la ligne droite.
- Le ballon suit son porteur ; une flèche de passe le fait partir du passeur et
  arriver au receveur ; un changement de porteur sans flèche l'y mène quand même.
- L'instantané ne porte aucune flèche.
- `recaler` : un tracé en L reste un L, ses extrémités tombent exactement sur
  `depart` et `arrivee` ; un tracé dégénéré retombe sur la ligne droite.

Par écran :

- Le lecteur avance et recule d'un temps par les zones tactiles, borné aux extrémités.
- Lecture puis pause laissent le tableau à l'endroit atteint.
- La boucle repart du premier temps ; le ralenti double la durée.
- `prefers-reduced-motion` supprime l'interpolation.
- Un visiteur ouvre le lecteur sans qu'aucun code lui soit demandé.

## Hors périmètre

- **La modification depuis le lecteur.** Il lit, il n'écrit pas.
- **Les durées par temps** et les vitesses réglables — écartées ci-dessus.
- **L'export de l'animation** (GIF, vidéo) : c'est 8D.
- **Les dossiers et l'attache aux entraînements** : c'est 8C.
- **Le son.** Un gymnase est trop bruyant, et personne ne regarde un tableau tactique
  avec des écouteurs.
