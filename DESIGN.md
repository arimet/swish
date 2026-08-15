---
name: Swish
description: Feuille de match basket pour club amateur — table de marque, statistiques, schémas tactiques.
colors:
  page: "#151c26"
  panel: "#0c1119"
  frame: "#0f141c"
  card: "#1f2735"
  card-raised: "#2b3547"
  border: "#3a475c"
  text: "#eef2f7"
  muted: "#a8b6c8"
  faint: "#96a4b6"
  brand: "#dcff33"
  on-brand: "#0f1a05"
  accent: "#dcff33"
  green-fill: "#22e08a"
  on-green: "#04240f"
  danger: "#ff8a9c"
  danger-fill: "#ff5470"
  on-danger: "#2b0308"
  gold-fill: "#ffd23f"
  on-gold: "#2b1d00"
  info-fill: "#46b6ff"
  on-info: "#04122e"
  court: "#141c26"
  court-paint: "#0d2b33"
  court-line: "#b8cdd9"
  court-attack: "#ff5470"
  court-defense: "#46b6ff"
  court-ball: "#ffd23f"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(2.75rem, 9vw, 6rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
  body-compact:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 900
    lineHeight: 1.3
    letterSpacing: "0.025em"
rounded:
  md: "0.68rem"
  lg: "0.85rem"
  xl: "1.19rem"
  2xl: "1.53rem"
  full: "9999px"
spacing:
  serre: "0.5rem"
  groupe: "0.75rem"
  section: "1.25rem"
  ecran: "1.5rem"
  doigt: "2.75rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.xl}"
    padding: "0 1.5rem"
    height: "{spacing.doigt}"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  button-neutral:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "{spacing.doigt}"
  button-neutral-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  button-danger:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    height: "{spacing.doigt}"
  button-danger-hover:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.on-danger}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.2xl}"
    padding: "1.25rem"
  well:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "0.5rem 0.75rem"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 0.875rem"
    height: "{spacing.doigt}"
  chip-label:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.label}"
  nav-item-active:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.brand}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
---

# Design System: Swish

> Les titres de sections sont en anglais : le format DESIGN.md est analysé au
> caractère près par l'outillage. La prose est en français, comme le reste du dépôt
> (interface, commentaires, messages de commit).
>
> Les valeurs de ce fichier décrivent le **thème sombre**, qui est le monde par défaut.
> Le thème clair est une composition à part entière : sa stratégie et ses valeurs
> décisives sont dans `## Colors`, mais ses quarante jetons ne sont recopiés nulle part
> — ils vivent dans `src/ui/theme/themes.css`, seule source de vérité, et une seconde
> copie dériverait au premier ajustement. Ce fichier dit **pourquoi** ; le CSS dit quoi.

## Overview

**Creative North Star: « La Nuit électrique »**

Un gymnase le soir. La salle est dans le noir, et ce qui éclaire, c'est le tableau
d'affichage et les lignes du terrain. Swish est cette scène : un canevas encre presque
noir, et un seul citron électrique qui porte tout ce qui compte — le score de
l'adversaire, le bouton qu'on va toucher, la période en cours. La couleur est rare
parce qu'elle est de la lumière, et une salle avec dix lampes n'éclaire rien.

Le produit est un outil, pas une vitrine. Il se tient à une main dans un gymnase, au
pouce, pendant qu'un match se joue — et il se lit aussi de loin, projeté pour les
spectateurs. Les chiffres sont donc l'objet principal : tabulaires, très lourds,
énormes quand ils sont le score. Tout le reste s'efface derrière eux. La densité est
moyenne et assumée : une table de marque doit montrer cinq joueurs, deux scores, un
chrono, les fautes et les temps-morts sans jamais défiler.

Le monde est **sombre d'abord**, et c'est un choix d'identité, pas un mode d'économie.
Le thème clair existe et il est composé, jamais hérité : il ne se déduit pas du sombre
par inversion. Trois palettes ont été rejetées avant celle-ci, toutes pour la même
raison — elles dérivaient chaque couleur d'une contrainte de contraste sur fond blanc,
ce qui force l'assombrissement et la désaturation. Le résultat était terne. La règle du
remplissage, plus bas, est la correction de cette erreur, et c'est la ligne la plus
importante du fichier.

**Key Characteristics:**
- Canevas encre, un seul accent citron électrique (`#dcff33`)
- Chiffres tabulaires, graisses 800–900, jusqu'à 6 rem pour un score
- Aucune ombre : la profondeur vient d'un escalier de plans et d'un filet de 1 px
- Toute commande fait 44 px de haut, sans exception
- Deux thèmes composés séparément, jamais l'un dérivé de l'autre
- Le terrain tactique a sa propre palette, dont la convention de teintes ne bascule pas

## Colors

Un canevas presque noir, un accent citron, et quatre teintes sémantiques qui ne
servent qu'à dire un état — jamais à décorer.

### Primary
- **Citron électrique** (`{colors.brand}`) : la seule couleur de marque. Elle
  **remplit** — boutons d'action, période courante, écusson, anneau du numéro de
  maillot, score adverse sur le tableau d'affichage. En thème sombre elle sert aussi
  d'encre (`accent`), parce que sur du charbon un citron lumineux est à la fois le
  meilleur texte et le meilleur bouton. En thème clair les deux rôles se séparent :
  l'aplat reste citron (`#a8c400`), l'encre devient une olive profonde (`#4a5600`),
  parce qu'un citron vif sur du blanc donne 1,15:1.
- **Encre sur citron** (`{colors.on-brand}`) : le presque-noir olive que porte tout
  aplat citron. Jamais du blanc.

### Secondary
Aucune. Swish n'a qu'un accent, et c'est délibéré — voir la règle d'une seule voix.

### Tertiary
Les quatre teintes de **sens**, chacune en couple aplat + encre portée :
- **Vert vif** (`{colors.green-fill}` / `{colors.on-green}`) : victoire, direct,
  démarrage du chrono.
- **Rose alerte** (`{colors.danger-fill}` / `{colors.on-danger}`) : faute, bonus,
  arrêt du chrono, suppression. Son **encre** est plus claire que son aplat
  (`{colors.danger}`) — le seul cas où le sombre doit séparer les deux, l'aplat plein
  tombant sous le seuil AA comme petit texte sur la carte.
- **Or** (`{colors.gold-fill}` / `{colors.on-gold}`) : à venir, planifié.
- **Bleu** (`{colors.info-fill}` / `{colors.on-info}`) : entraînement, seconde série
  d'un graphique.

### Neutral
Six plans, et l'ordre est la profondeur du produit — il n'y a pas d'ombre pour la dire.
De la carte vers le fond : `{colors.card-raised}` (pastille dans une carte) >
`{colors.card}` (le plan haut, la carte) > `{colors.frame}` (le fond de
l'application) > `{colors.panel}` (le puits creusé dans une carte). La carte est à
trois fois la clarté de son cadre : plus serré, l'écran devient un seul charbon.

`{colors.page}` est la **gouttière**, visible seulement au-delà de `lg`, et elle change
de côté selon le thème — voir la règle du bureau.

Trois niveaux d'encre : `{colors.text}` (le contenu), `{colors.muted}` (le secondaire),
`{colors.faint}` (les étiquettes et les unités). Trois niveaux qui se confondraient ne
seraient qu'un seul niveau avec trois noms.

### Le terrain
Le tableau tactique a sa propre famille (`--t-*`), et la distinction est délibérée. Sa
**surface** bascule avec le thème — parquet clair dans l'application claire, sombre
dans la sombre. Sa **convention de teintes** ne bascule pas : le rouge dit toujours
« attaque », le bleu « défense », l'or « ballon ». Un tableau tactique est un carnet de
coach, et retourner cette convention reviendrait à réapprendre à lire à celui qui la
connaît. Les quatre repères restent distincts par la **forme** — disque plein, anneau
ouvert, petit disque, trait — donc lisibles aussi en noir et blanc.

### Named Rules

**La règle du remplissage.** La couleur vit dans les **aplats**, avec leur encre
appariée (`*-fill` + `on-*`) ; les encres restent presque noires ou presque blanches.
Une couleur qui n'a pas à se lire comme petit texte sur du blanc n'a plus besoin
d'être assombrie — et c'est l'assombrissement qui rendait l'ensemble terne. Corollaire
opérationnel : `brand` **remplit**, `accent` **écrit**. Employer `brand` comme encre
donne 1,77:1 sur une ligne claire ; c'est arrivé, et seule la passe en thème clair l'a
trouvé.

**La règle d'une seule voix.** Un seul accent sur toute l'application. Un second
accent ne double pas l'expressivité, il divise par deux la lisibilité du premier. Les
teintes sémantiques ne sont pas des accents : elles disent un état et disparaissent
quand l'état disparaît.

**La règle du bureau.** La gouttière doit se **voir** et ne jamais **dominer** la
carte. Le sens de l'écart suit la place disponible et non une symétrie : en clair il y
a de la place sous le papier, donc elle descend ; en sombre il n'y en a pas sous le
noir, donc elle monte au-dessus du cadre. Exiger « toujours plus foncée » a produit une
gouttière invisible, et l'inverse naïf une gouttière gris pâle dans laquelle
l'application flottait.

**La règle du hachage.** Une couleur tirée d'un hachage d'identifiant (`teamColor`) est
juste pour un **écusson** dans une liste, et fausse partout ailleurs. Sur un tableau
d'affichage la question n'est pas « laquelle des six équipes » mais « nous ou eux », et
un hachage y a produit un marine à 2,1:1 sur carte sombre. Jamais de hachage comme
encre, ni comme série de graphique.

## Typography

**Display / Body / Label :** Geist Variable (avec `sans-serif` en repli). Une seule
famille pour tout, auto-hébergée via `@fontsource-variable/geist`.

**Character :** une grotesque neutre et très lisible en petit corps, dont les chiffres
tabulaires sont la raison du choix. Le caractère du produit ne vient pas de la famille
mais de la **graisse** — 800 et 900 dominent — et de l'échelle : un score à 6 rem à
côté d'une étiquette à 12 px, sans rien entre les deux.

### Hierarchy
- **Display** (900, `clamp(2.75rem, 9vw, 6rem)`, `line-height: 1`, `-0.02em`,
  tabulaire) : les scores et le chrono, et rien d'autre. Toujours via la classe `.nums`.
- **Headline** (800, 1,5 rem, `tracking-tight`) : le titre d'un écran, une fois par page.
- **Title** (800, 1 rem, souvent en majuscules) : le titre d'une carte ou d'une section.
- **Body** (600, 0,875 rem) : tout le contenu courant. C'est le corps le plus utilisé du
  dépôt, de loin.
- **Body-compact** (600, 0,8125 rem) : le corps des **dialogues** et des panneaux
  secondaires denses — le message d'une confirmation, l'explication d'un dialogue de
  code, une aide d'administration, le panneau d'accès de la barre latérale. Employé
  aussi par quelques commandes serrées (corrections de chrono, onglets de dossier).
  Un dialogue est lu de près, sur une surface étroite : un cran sous le corps courant
  y tient la mesure sans rétrécir la cible.
- **Label** (900, 0,75 rem, `uppercase`, `tracking-wide`) : les micro-étiquettes —
  « FAUTES », « PROCHAINE ÉCHÉANCE », « POINTS MARQUÉS ». Le second corps le plus
  utilisé : c'est lui qui donne le grain « feuille de match ».

### Named Rules

**La règle des chiffres tabulaires.** Tout nombre qui peut changer sous l'œil porte
`.nums` (`font-variant-numeric: tabular-nums`, `-0.02em`). Un score qui passe de 9 à
10 ne doit pas déplacer ce qui l'entoure, et un chrono qui compte ne doit pas frémir.

**La règle des trois petits corps.** L'échelle des petits corps s'arrête à trois pas —
12 px pour l'étiquette, 13 px pour le dialogue, 14 px pour le contenu — et chacun a une
surface à lui. Un quatrième pas n'ajouterait pas de hiérarchie, il ajouterait une
hésitation : au-delà, on distingue par la **graisse** et la **casse**, jamais par un
demi-point de plus.

> Cette règle a d'abord été écrite comme « la règle des deux corps », interdisant le
> pas de 13 px. C'était une invention : le dépôt l'emploie dix-neuf fois, dans dix
> fichiers, et de façon cohérente. Le détecteur a signalé l'écart dès la première
> retouche, et c'est la documentation qui avait tort — un `DESIGN.md` décrit un système
> établi, il ne légifère pas contre lui.

## Layout

Coquille fixe et contenu qui défile. Au-delà de `lg` (1024 px), l'application est un
rectangle arrondi (26 px) posé dans une gouttière de 16 px, avec une barre latérale de
navigation ; en dessous, elle occupe tout l'écran et la navigation passe en barre
basse. Les points de rupture réellement employés sont `sm` (640 px) et `lg` — `md` et
`xl` sont l'exception, et le mobile est le cas par défaut du code, pas une adaptation.

Conteneurs : `max-w-6xl` pour les écrans de lecture, `max-w-4xl` pour la table de
marque, `max-w-2xl` pour les formulaires. Le rythme vertical tient en quatre pas :
`{spacing.serre}` à l'intérieur d'un groupe, `{spacing.groupe}` entre deux lignes de
liste, `{spacing.section}` entre deux blocs, `{spacing.ecran}` pour la marge d'écran.

La table de marque est le seul écran à `h-dvh` avec `overflow-hidden` : le tableau
d'affichage et le chrono ne défilent jamais hors de vue, seul l'effectif défile dans sa
propre boîte (`min-h-0` sur le parent flexible, sans quoi l'enfant refuse de se
comprimer).

### Named Rules

**La règle du doigt.** Toute commande fait `{spacing.doigt}` (44 px) de haut au
minimum, et 24 px est le plancher absolu même au pointeur. On saisit un match dans un
gymnase, au pouce, sans regarder — un bouton de 25 px n'est pas un petit bouton, c'est
un bouton raté. Corollaire : sous `sm`, une action ne partage jamais sa rangée avec du
texte ; elle passe dessous, sur toute la largeur.

## Elevation & Depth

**Aucune ombre.** La profondeur est **tonale**, et c'est un invariant : elle vient de
l'escalier des six plans neutres, plus un filet de 1 px (`{colors.border}`) qui dessine
le bord des cartes. C'est ce que réclame un canevas encre — vers le noir, une ombre
noire n'a rien à assombrir.

Les ombres de Tailwind (`shadow-lg`, `shadow-2xl`) sont calibrées pour flotter au-dessus
d'un fond clair : sur le bandeau clair de la table de marque, `shadow-lg` se lisait
comme une salissure sous le bouton. Elles ont été retirées.

Une seule exception, et c'est une ombre de mise en scène et non de profondeur : la
coquille au-delà de `lg` porte un `shadow-2xl` qui la détache de sa gouttière, comme
une feuille posée sur un bureau.

### Named Rules

**La règle du plan.** Un élément se détache par son **plan** et son **filet**, jamais
par une ombre. Si deux surfaces ne se distinguent pas, on écarte leurs clartés — on
n'ajoute pas une ombre. Et jamais de voile d'opacité sur une carte (`bg-card/50`) : il
rapproche la carte de son fond de moitié et annule l'écart qu'on vient de creuser.

## Shapes

Des angles franchement adoucis, sur une seule échelle dérivée d'un rayon de base
(`0.85rem`). Trois usages tiennent presque tout : `{rounded.xl}` pour les commandes et
les lignes de liste, `{rounded.2xl}` pour les cartes, `{rounded.full}` pour les
pastilles, les écussons et les boutons du bandeau. `{rounded.md}` reste aux petites
commandes carrées (une croix de suppression, un chiffre de maillot).

Pas de bordure colorée épaisse, pas de coin coupé, pas de silhouette irrégulière. La
seule géométrie signée du produit est le **terrain** — un demi ou un plein terrain FIBA
coté en mètres, avec sa raquette peinte et son arc à trois points, dessiné en SVG et
non approximé.

### Named Rules

**La règle du filet supérieur.** Un panneau qui appartient à une équipe porte un liseré
intérieur de 3 px de la couleur de marque sur son bord haut
(`inset 0 3px 0 0 var(--c-brand)`), et rien d'autre. C'est le seul ornement structurel
autorisé.

## Components

Les commandes sont **franches et visées au pouce** : hautes, en graisse lourde, sur
aplat saturé, sans ombre. Une commande se touche dans un gymnase pendant qu'un match se
joue ; elle doit se trouver sans être cherchée.

### Buttons
- **Shape :** angles adoucis (`{rounded.xl}`) pour l'action principale,
  `{rounded.md}` pour les commandes secondaires, `{rounded.full}` sur le bandeau de la
  table de marque.
- **Primary :** aplat citron (`{colors.brand}`) et encre presque noire
  (`{colors.on-brand}`), 44 px de haut, libellé en 600 terminé par une flèche `→`
  quand il mène ailleurs.
- **Neutral :** aplat `{colors.card-raised}`, encre `{colors.text}`. **Au survol, il
  devient citron** — c'est le geste commun à toute l'application, pas une variante
  locale.
- **Danger :** encre `{colors.danger}` sur fond voilé au repos, aplat
  `{colors.danger-fill}` au survol. Volontairement discret au repos : un aplat criard
  invite le pouce à s'y poser.
- **Hover / Focus / Active :** `transition` sur la couleur, `active:scale-90` sur les
  commandes de saisie répétée (les `+1`, les corrections de chrono) et
  `active:scale-95` ailleurs. Le focus est l'anneau natif du navigateur, teinté par
  `outline-ring/50` — jamais supprimé.

### Chips
- **Style :** `{colors.card-raised}` et encre `{colors.muted}`, corps Label, angles
  `{rounded.md}`. Une pastille d'état colorée porte l'aplat sémantique et son encre
  appariée (Bonus en rose, « En direct » en vert, « À venir » en or).
- **State :** la période courante du bandeau porte l'aplat citron ; les périodes
  passées `{colors.card-raised}` ; les à venir un simple voile.

### Cards / Containers
- **Corner Style :** `{rounded.2xl}`.
- **Background :** `{colors.card}`, à pleine opacité — jamais voilée.
- **Shadow Strategy :** aucune. Voir Elevation & Depth.
- **Border :** filet de 1 px `{colors.border}`.
- **Internal Padding :** `{spacing.section}` (1,25 rem), `{spacing.ecran}` au-delà de
  `sm`. Les lignes internes se posent sur un puits `{colors.panel}`, plus sombre que la
  carte.

### Inputs / Fields
- **Style :** fond `{colors.panel}` (un puits, plus sombre que la carte qui le porte),
  filet 1 px, angles `{rounded.md}`, 44 px de haut.
- **Focus :** le liseré passe à `{colors.accent}`, sans lueur.
- **Label :** une vraie étiquette au-dessus du champ, jamais un `placeholder` seul —
  il disparaît à la première frappe, donc au moment précis où l'on vérifie qu'on
  remplit la bonne case, et un lecteur d'écran n'annonce qu'« champ de saisie ».
- **Case à cocher :** 1,125 rem, `accent-color: {colors.brand}`, et c'est le
  `<label>` qui l'englobe qui constitue la cible.

### Navigation
Barre latérale au-delà de `lg`, barre basse en dessous, avec les mêmes destinations. La
ligne active porte `{colors.card-raised}` et une encre citron ; les autres sont en
`{colors.muted}`. Icônes Lucide, trait 2, taille 16–18 px, une seule famille.

### Le tableau d'affichage
Le composant signature. Deux scores en Display de part et d'autre du chrono, chacun
précédé d'une pastille de 8 px et du nom de l'équipe. **Nous en encre
(`{colors.text}`), l'adversaire en accent (`{colors.accent}`)** : la question posée est
« nous ou eux ». Le score qui mène est à pleine opacité, l'autre à 0,85.

Le nombre accuse réception du geste qui l'a changé, et le **sens** compte : il monte
parce qu'on a marqué (`score-up`, 150 ms), il descend parce qu'on a annulé
(`score-down`). C'est le seul mouvement d'auteur du produit, et il porte une
information que rien d'autre ne porte — *le geste a été pris en compte, de ce côté-ci*.
Rien au premier rendu.

## Do's and Don'ts

### Do:
- **Do** faire porter la couleur par un **aplat** avec son encre appariée
  (`--c-*-fill` + `--c-on-*`). C'est la règle du remplissage, et elle est la correction
  de trois palettes rejetées.
- **Do** employer `--c-brand` pour remplir et `--c-accent` pour écrire. En thème sombre
  les deux valent la même chose ; en clair ils divergent, et c'est le clair qui révèle
  l'erreur.
- **Do** donner 44 px de haut à toute commande, et faire passer l'action sous le texte
  en dessous de `sm`.
- **Do** pointer les jetons shadcn (`--card`, `--muted`, `--background`) vers les plans
  `--c-*`. Une seconde échelle à un pour cent près se corrige deux fois et dérive.
- **Do** porter `.nums` sur tout nombre susceptible de changer sous l'œil.
- **Do** composer le thème clair **séparément**. Il ne se déduit pas du sombre.
- **Do** vérifier les deux thèmes avant de conclure. Le sombre pardonne un citron
  partout ; le clair non.

### Don't:
- **Don't** ajouter d'ombre pour détacher un élément. On écarte les plans, on pose un
  filet de 1 px.
- **Don't** voiler une carte (`bg-card/50`) : le voile annule la moitié de la
  séparation des plans.
- **Don't** employer une couleur Tailwind brute (`bg-red-600`, `text-emerald-700`).
  Elles sont calibrées pour un charcoal et sortent de la charte dans les deux thèmes.
  Le dépôt n'en contient aucune, et c'est un état à préserver.
- **Don't** créer de famille de jetons pour une surface qui « ne basculerait pas ». Ça
  a été tenté deux fois — le bandeau de la table de marque et le terrain — et les deux
  ont produit un rectangle noir au milieu d'une application claire. Seule la
  *convention de teintes* du terrain échappe au thème, jamais sa surface.
- **Don't** colorer un texte ou une série de graphique par un hachage d'identifiant.
  Réservé aux écussons.
- **Don't** mettre le nom d'un champ dans son seul `placeholder`.
- **Don't** annoncer un rapport de contraste dans un commentaire. Les chiffres
  périment au premier ajustement de teinte et personne ne les recalcule ; ils vivent
  dans `src/ui/theme/contrast.test.ts`, qui relit le CSS et refait le calcul.
- **Don't** ajouter de mouvement pour rendre la finition visible. Un seul moment
  d'auteur existe (le score qui répond), et le mouvement infini est coupé sous
  `prefers-reduced-motion` sans supprimer l'accusé de réception.
