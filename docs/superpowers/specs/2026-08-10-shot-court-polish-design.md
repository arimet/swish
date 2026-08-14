# Terrain de tir : retour au tap, lisibilité, zones déjà tirées

Date : 2026-08-10 · Branche : `claude/shot-positions-player-stats-e92c9b`
Projet **1 sur 3** de la réorientation de l'application.

## Le découpage dont ce spec fait partie

L'application se réoriente autour d'une équipe unique — l'Avenir de Vignot — qui veut
exploiter ses données. Le classement et les autres équipes deviennent du contexte. Trois
projets en découlent, chacun avec son spec, son plan et son cycle :

| # | Projet | Contenu |
|---|---|---|
| **1** | **Terrain** (ce spec) | retour au tap, lisibilité du demi-terrain, zones déjà tirées dans la popup et sur le suivi |
| 2 | Réorientation | mon club = Vignot, menu recentré avec section « Championnat », tableau de bord |
| 3 | Rôles | trois codes d'accès : admin, table de marque, joueur (lecture personnalisée) |

Ce projet est le premier parce qu'il est petit, sans dépendance, et utilisable dès le
prochain match. Les deux suivants restructurent l'application ; il serait absurde de
protéger ou de réorganiser des écrans qu'on s'apprête à retoucher.

## Objectif

Trois manques constatés à l'usage sur la saisie des tirs :

1. **On ne voit pas ce qu'on vient d'enregistrer.** La popup se ferme instantanément après
   le tap. Rien ne confirme la zone retenue ni les points comptés.
2. **Le demi-terrain est illisible.** Tous ses tracés sont au même poids, ce qui donne un
   dessin plat où l'on distingue mal la raquette, l'arc et les cibles.
3. **On ne voit pas d'où le joueur a déjà tiré**, ni pendant la saisie, ni sur l'écran de
   suivi — alors que la donnée existe et n'est visible qu'après le match.

## Décisions actées

| Question | Choix |
|---|---|
| Retour au tap | Point à l'endroit touché + zone illuminée + libellé, puis fermeture (~350 ms) |
| Haptique | Ajoutée là où le navigateur la supporte, jamais seule |
| Zones déjà tirées | Dans la popup de saisie **et** sur le suivi spectateur |
| Géométrie des zones | **Intouchée** — l'embellissement ne porte que sur le décoratif |

---

## 1. Retour au tap — `ShotPicker`

`ShotPicker` retient le dernier tir saisi dans un état local, et rend par-dessus le
terrain :

- un **point plein** aux coordonnées exactes du tap ;
- un **anneau qui s'étend et s'efface** depuis ce point (animation SVG native, pas de
  dépendance) ;
- la **zone touchée illuminée** — en réutilisant `ZONE_PATH`, déjà présent dans le
  fichier ;
- une **pastille de libellé** : « 3 PTS · Aile / axe à 3 pts » pour un tir réussi,
  « MANQUÉ · Raquette » pour un tir manqué.

La pastille porte `role="status"` : le tir enregistré est ainsi annoncé aux lecteurs
d'écran, pas seulement montré.

### Le double comptage, à empêcher explicitement

Pendant les 350 ms d'affichage du retour, le terrain reste à l'écran. Sans garde, un
second tap — volontaire ou accidentel, un doigt qui rebondit sur une tablette —
enregistrerait un second tir. **`ShotPicker` neutralise toute saisie dès le premier tap**,
terrain et boutons de zone compris, jusqu'à ce que le composant soit démonté.

C'est la contrepartie assumée du confort ajouté : sans ce garde, on aurait créé un bug de
comptage en voulant supprimer une gêne.

### Haptique

`navigator.vibrate?.(15)`, en appel gardé.

**iOS n'implémente pas cette API**, quel que soit le navigateur. Sur un iPad de table de
marque, seul le retour visuel jouera. C'est précisément pourquoi le visuel est le
mécanisme principal et la vibration un supplément.

### Fermeture différée — `PlayerActionDialog`

La popup se ferme après le délai. Le minuteur est annulé au démontage : sans cela, fermer
la popup à la main pendant le délai déclencherait une mise à jour d'état sur un composant
démonté.

Le délai est une constante nommée exportée depuis `ShotCourt.tsx`, pour que le test
l'utilise plutôt que de coder 350 en dur à deux endroits.

## 2. Lisibilité du demi-terrain — `CourtLines`

Aujourd'hui `CourtLines` trace tout avec `strokeWidth: 8` et `opacity: 0.45`. Six
changements, tous décoratifs :

1. **Hiérarchie des traits.** Limites du terrain et ligne à 3 points au poids fort ;
   raquette et cercle de lancer franc plus légers ; zone restrictive plus légère encore.
   Le regard doit trouver l'arc et la raquette sans les chercher.
2. **La raquette reçoit un fond propre**, discret et distinct du reste de la surface.
3. **Ajout de la zone restrictive** — l'arc de 1,25 m sous le panier. Tracé FIBA réel,
   absent aujourd'hui.
4. **Panneau et arceau dessinés correctement** : un rectangle de panneau et un cercle
   d'arceau, au lieu d'un trait et d'un rond de même épaisseur.
5. **Séparateurs de zones en pointillés très discrets**, pour deviner les sept cibles
   avant de toucher.
6. **Surface en dégradé sombre** plutôt qu'un aplat, pour que les points de tir accrochent.

### La contrainte qui encadre tout ce point

**Les sept chemins de `ZONE_PATH` ne sont pas modifiés.** Leur géométrie a été vérifiée
point par point contre la fonction `zoneAt` par lancer de rayons, drapeaux de balayage
compris. Les redessiner pour des raisons esthétiques risquerait de désaligner les zones
colorées des zones réellement calculées — une carte de chaleur qui ment sur l'endroit des
tirs. L'embellissement porte sur `CourtLines` et sur les fonds, jamais sur les frontières.

Un test fige cette contrainte : les chemins de `ZONE_PATH` doivent rester littéralement
ceux d'aujourd'hui.

## 3. Zones déjà tirées

### Dans la popup de saisie

`ShotPicker` accepte une liste de tirs optionnelle et les dessine **en fond** du terrain :
pleins pour les réussis, creux pour les manqués, plus discrets que le point de confirmation
pour ne pas le noyer. La table voit l'historique du joueur au moment où elle saisit le tir
suivant.

Les données viennent de `shotsOf([match], playerId)`, déjà écrit et testé. Aucun nouveau
calcul, aucun nouveau type.

### Sur le suivi spectateur

Dans `StatList`, une ligne de joueur devient dépliable : elle révèle sa carte de tirs du
match, avec `minAttempts={1}` — sur une seule rencontre, exiger trois tentatives par zone
n'afficherait presque jamais rien.

Cet écran est souvent projeté en salle : la carte s'affiche en grand, une seule à la fois,
et la ligne dépliée est clairement marquée.

Le suivi spectateur reste **en lecture seule** : ce dépliage ne permet aucune saisie.

---

## Fichiers touchés

**Modifiés** — `src/ui/components/ShotCourt.tsx` (le gros du travail),
`src/ui/components/PlayerActionDialog.tsx` (fermeture différée, transmission des tirs),
`src/ui/screens/LiveMatch.tsx` et `src/ui/screens/SoloLiveMatch.tsx` (fournir les tirs du
joueur à la popup), `src/ui/screens/SummaryScreen.tsx` (idem, mode correction),
`src/ui/screens/SpectatorMatch.tsx` (lignes dépliables).

**Inchangés** — tout `src/domain/` : ce projet n'ajoute aucune donnée, aucun évènement,
aucun calcul. Il rend visible ce qui est déjà enregistré.

## Tests

- Le tap affiche le point, la pastille de libellé, et appelle la vibration quand elle
  existe.
- Un second tap pendant le délai de confirmation **n'enregistre pas** de second tir.
- Le minuteur de fermeture est annulé si la popup est fermée à la main pendant le délai.
- `ShotPicker` recevant des tirs les dessine en fond.
- Les chemins de `ZONE_PATH` sont littéralement inchangés.
- Sur le suivi, déplier un joueur affiche sa carte de tirs ; une seule à la fois.

## Hors périmètre

- **La hot zone sur le tableau de bord** — le tableau de bord n'existe pas encore, il
  arrive au projet 2.
- **Un retour sonore.** Une table de marque travaille dans un gymnase bruyant, et le son
  gênerait le public. Le visuel et la vibration suffisent.
- **Annuler le dernier tir depuis la pastille de confirmation.** Séduisant, mais la
  correction existe déjà dans la popup et un second geste dans la fenêtre de fermeture
  rouvrirait le risque de double action.
