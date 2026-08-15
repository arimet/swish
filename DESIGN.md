---
name: Swish
description: Basketball match sheet for an amateur club — scorer's table, statistics, playbook.
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
  tight: "0.5rem"
  group: "0.75rem"
  section: "1.25rem"
  screen: "1.5rem"
  finger: "2.75rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.xl}"
    padding: "0 1.5rem"
    height: "{spacing.finger}"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  button-neutral:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "{spacing.finger}"
  button-neutral-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  button-danger:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    height: "{spacing.finger}"
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
    height: "{spacing.finger}"
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

> The section headings follow the DESIGN.md format, which the tooling parses to the
> character. Everything else — prose, comments, commit messages, identifiers — is in
> English. The one thing that stays French is the interface itself: the product is a
> French club's, and its words are its own.
>
> The values in this file describe the **dark theme**, which is the default world. The
> light theme is a composition in its own right: its strategy and its decisive values
> are in `## Colors`, but its forty tokens are copied nowhere — they live in
> `src/ui/theme/themes.css`, the single source of truth, and a second copy would drift
> at the first adjustment. This file says **why**; the CSS says what.

## Overview

**Creative North Star: "Electric night"**

A gym in the evening. The hall is dark, and what gives light is the scoreboard and the
court's lines. Swish is that scene: a near-black ink canvas, and a single electric lemon
carrying everything that counts — the opposition's score, the button about to be
touched, the current period. Colour is rare because it is light, and a hall with ten
lamps lights nothing.

The product is a tool, not a showcase. It is held one-handed in a gym, under a thumb,
while a game is being played — and it is also read from a distance, projected for
spectators. The numbers are therefore the main object: tabular, very heavy, enormous
when they are the score. Everything else recedes behind them. The density is medium and
deliberate: a scorer's table has to show five players, two scores, a clock, the fouls
and the timeouts without ever scrolling.

The world is **dark first**, and that is a choice of identity, not an economy mode. The
light theme exists and it is composed, never inherited: it is not derived from the dark
one by inversion. Three palettes were rejected before this one, all for the same reason
— they derived every colour from a contrast constraint against white, which forces
darkening and desaturation. The result was drab. The fill rule, below, is the correction
of that error, and it is the most important line in the file.

**Key Characteristics:**
- Ink canvas, a single electric lemon accent (`#dcff33`)
- Tabular figures, weights 800–900, up to 6 rem for a score
- No shadow: depth comes from a staircase of planes and a 1 px hairline
- Every control is 44 px tall, without exception
- Two themes composed separately, neither derived from the other
- The playbook court has its own palette, whose colour convention does not switch

## Colors

A near-black canvas, a lemon accent, and four semantic hues that serve only to state a
state — never to decorate.

### Primary
- **Electric lemon** (`{colors.brand}`): the only brand colour. It **fills** — action
  buttons, the current period, the crest, the ring around a jersey number, the
  opposition's score on the scoreboard. In the dark theme it also serves as ink
  (`accent`), because on charcoal a luminous lemon is at once the best text and the best
  button. In the light theme the two roles separate: the flat area stays lemon
  (`#a8c400`), the ink becomes a deep olive (`#4a5600`), because a vivid lemon on white
  gives 1.15:1.
- **Ink on lemon** (`{colors.on-brand}`): the near-black olive that every lemon flat
  area carries. Never white.

### Secondary
None. Swish has one accent, and that is deliberate — see the one-voice rule.

### Tertiary
The four hues of **meaning**, each as a fill + carried-ink pair:
- **Vivid green** (`{colors.green-fill}` / `{colors.on-green}`): a win, live, starting
  the clock.
- **Alert pink** (`{colors.danger-fill}` / `{colors.on-danger}`): a foul, the bonus,
  stopping the clock, deletion. Its **ink** is lighter than its fill
  (`{colors.danger}`) — the one case where dark must separate the two, the full flat
  area falling under the AA threshold as small text on the card.
- **Gold** (`{colors.gold-fill}` / `{colors.on-gold}`): upcoming, scheduled.
- **Blue** (`{colors.info-fill}` / `{colors.on-info}`): training, a chart's second
  series.

### Neutral
Six planes, and their order is the product's depth — there is no shadow to state it.
From the card down to the ground: `{colors.card-raised}` (a pill inside a card) >
`{colors.card}` (the high plane, the card) > `{colors.frame}` (the application's
background) > `{colors.panel}` (the well hollowed into a card). The card sits at three
times its frame's lightness: any tighter and the screen becomes a single charcoal.

`{colors.page}` is the **gutter**, visible only above `lg`, and it changes side
depending on the theme — see the desk rule.

Three levels of ink: `{colors.text}` (the content), `{colors.muted}` (the secondary),
`{colors.faint}` (the labels and the units). Three levels that blurred together would be
one level with three names.

### The court
The playbook has its own family (`--t-*`), and the distinction is deliberate. Its
**surface** switches with the theme — light hardwood in the light application, dark in
the dark one. Its **colour convention** does not switch: red always says "attack", blue
"defence", gold "ball". A playbook is a coach's notebook, and flipping that convention
would amount to teaching someone who knows it to read again. The four markers stay
distinct by **shape** — filled disc, open ring, small disc, stroke — hence legible in
black and white too.

### Named Rules

**The fill rule.** Colour lives in the **flat areas**, with their paired ink (`*-fill` +
`on-*`); the inks stay near-black or near-white. A colour that does not have to read as
small text on white no longer needs darkening — and it was the darkening that made the
whole thing drab. Operational corollary: `brand` **fills**, `accent` **writes**. Using
`brand` as ink gives 1.77:1 on a light row; that happened, and only the light-theme pass
found it.

**The one-voice rule.** One accent across the whole application. A second accent does
not double the expressiveness, it halves the legibility of the first. The semantic hues
are not accents: they state a state and disappear when the state does.

**The desk rule.** The gutter must be **visible** and must never **dominate** the card.
The direction of the gap follows the room available and not a symmetry: on light there
is room under the paper, so it goes down; on dark there is none under the black, so it
goes up above the frame. Demanding "always darker" produced an invisible gutter, and the
naive converse a pale grey gutter in which the application floated.

**The hash rule.** A colour drawn from a hash of an id (`teamColor`) is right for a
**crest** in a list, and wrong everywhere else. On a scoreboard the question is not
"which of the six teams" but "us or them", and a hash there produced a navy at 2.1:1 on
a dark card. Never a hash as ink, nor as a chart series.

## Typography

**Display / Body / Label:** Geist Variable (with `sans-serif` as fallback). One family
for everything, self-hosted through `@fontsource-variable/geist`.

**Character:** a neutral grotesque, very legible at small sizes, whose tabular figures
are the reason for the choice. The product's character comes not from the family but
from the **weight** — 800 and 900 dominate — and from the scale: a score at 6 rem next
to a label at 12 px, with nothing in between.

### Hierarchy
- **Display** (900, `clamp(2.75rem, 9vw, 6rem)`, `line-height: 1`, `-0.02em`, tabular):
  the scores and the clock, and nothing else. Always through the `.nums` class.
- **Headline** (800, 1.5 rem, `tracking-tight`): a screen's title, once per page.
- **Title** (800, 1 rem, often uppercase): a card's or a section's title.
- **Body** (600, 0.875 rem): all the ordinary content. It is by far the most used size
  in the repo.
- **Body-compact** (600, 0.8125 rem): the body of **dialogs** and dense secondary panels
  — a confirmation's message, a code dialog's explanation, an administration hint, the
  sidebar's access panel. Also used by a few tight controls (clock corrections, folder
  tabs). A dialog is read close up, on a narrow surface: one step under the ordinary
  body holds the measure there without shrinking the target.
- **Label** (900, 0.75 rem, `uppercase`, `tracking-wide`): the micro-labels —
  "FAUTES", "PROCHAINE ÉCHÉANCE", "POINTS MARQUÉS". The second most used size: it is
  what gives the "match sheet" grain.

### Named Rules

**The tabular-figures rule.** Every number that can change under the eye carries `.nums`
(`font-variant-numeric: tabular-nums`, `-0.02em`). A score going from 9 to 10 must not
shift what surrounds it, and a counting clock must not shiver.

**The three-small-sizes rule.** The scale of small sizes stops at three steps — 12 px for
the label, 13 px for the dialog, 14 px for the content — and each has a surface of its
own. A fourth step would add no hierarchy, it would add a hesitation: beyond that, we
distinguish by **weight** and **case**, never by half a point more.

> This rule was first written as "the two-sizes rule", forbidding the 13 px step. That
> was an invention: the repo uses it nineteen times, across ten files, and consistently.
> The detector flagged the discrepancy at the first touch-up, and it was the
> documentation that was wrong — a `DESIGN.md` describes an established system, it does
> not legislate against it.

## Layout

A fixed shell and content that scrolls. Above `lg` (1024 px), the application is a
rounded rectangle (26 px) laid in a 16 px gutter, with a navigation sidebar; below it,
it takes the whole screen and navigation moves to a bottom bar. The breakpoints actually
used are `sm` (640 px) and `lg` — `md` and `xl` are the exception, and mobile is the
code's default case, not an adaptation.

Containers: `max-w-6xl` for reading screens, `max-w-4xl` for the scorer's table,
`max-w-2xl` for forms. The vertical rhythm fits in four steps: `{spacing.tight}` inside
a group, `{spacing.group}` between two list rows, `{spacing.section}` between two blocks,
`{spacing.screen}` for the screen margin.

The scorer's table is the only screen at `h-dvh` with `overflow-hidden`: the scoreboard
and the clock never scroll out of view, and only the roster scrolls in its own box
(`min-h-0` on the flex parent, without which the child refuses to be compressed).

### Named Rules

**The finger rule.** Every control is `{spacing.finger}` (44 px) tall at minimum, and
24 px is the absolute floor even under a pointer. A game is recorded in a gym, with a
thumb, without looking — a 25 px button is not a small button, it is a failed one.
Corollary: below `sm`, an action never shares its row with text; it goes underneath, at
full width.

## Elevation & Depth

**No shadow.** Depth is **tonal**, and that is an invariant: it comes from the staircase
of six neutral planes, plus a 1 px hairline (`{colors.border}`) that draws the cards'
edges. It is what an ink canvas demands — towards black, a black shadow has nothing left
to darken.

Tailwind's shadows (`shadow-lg`, `shadow-2xl`) are calibrated to float above a light
background: on the scorer's table's light banner, `shadow-lg` read as a smudge under the
button. They were removed.

One exception, and it is a shadow of staging rather than of depth: above `lg` the shell
carries a `shadow-2xl` that detaches it from its gutter, like a sheet laid on a desk.

### Named Rules

**The plane rule.** An element detaches by its **plane** and its **hairline**, never by a
shadow. If two surfaces do not separate, spread their lightnesses — do not add a shadow.
And never veil a card with opacity (`bg-card/50`): it brings the card halfway back to its
background and cancels the gap just opened.

## Shapes

Frankly softened corners, on a single scale derived from a base radius (`0.85rem`).
Three uses cover almost everything: `{rounded.xl}` for controls and list rows,
`{rounded.2xl}` for cards, `{rounded.full}` for pills, crests and the banner's buttons.
`{rounded.md}` is left to small square controls (a delete cross, a jersey number).

No thick coloured border, no cut corner, no irregular silhouette. The product's one
signed geometry is the **court** — a FIBA half or full court dimensioned in metres, with
its painted key and its three-point arc, drawn in SVG rather than approximated.

### Named Rules

**The top-hairline rule.** A panel belonging to a team carries a 3 px inner rule in the
brand colour along its top edge (`inset 0 3px 0 0 var(--c-brand)`), and nothing else. It
is the only structural ornament allowed.

## Components

The controls are **plain and thumb-aimed**: tall, in heavy weight, on saturated flat
areas, without shadow. A control is touched in a gym while a game is being played; it
must be found without being looked for.

### Buttons
- **Shape:** softened corners (`{rounded.xl}`) for the primary action, `{rounded.md}`
  for secondary controls, `{rounded.full}` on the scorer's table banner.
- **Primary:** lemon flat area (`{colors.brand}`) and near-black ink
  (`{colors.on-brand}`), 44 px tall, label at 600 ending in an arrow `→` when it leads
  elsewhere.
- **Neutral:** `{colors.card-raised}` flat area, `{colors.text}` ink. **On hover it turns
  lemon** — that is the gesture common to the whole application, not a local variant.
- **Danger:** `{colors.danger}` ink on a veiled background at rest, `{colors.danger-fill}`
  flat area on hover. Deliberately discreet at rest: a loud flat area invites the thumb
  to land on it.
- **Hover / Focus / Active:** `transition` on colour, `active:scale-90` on the controls of
  repeated entry (the `+1`s, the clock corrections) and `active:scale-95` elsewhere. Focus
  is the browser's native ring, tinted by `outline-ring/50` — never removed.

### Chips
- **Style:** `{colors.card-raised}` and `{colors.muted}` ink, Label size, `{rounded.md}`
  corners. A coloured state pill carries the semantic flat area and its paired ink (the
  bonus in pink, "En direct" in green, "À venir" in gold).
- **State:** the banner's current period carries the lemon flat area; past periods
  `{colors.card-raised}`; upcoming ones a plain veil.

### Cards / Containers
- **Corner Style:** `{rounded.2xl}`.
- **Background:** `{colors.card}`, at full opacity — never veiled.
- **Shadow Strategy:** none. See Elevation & Depth.
- **Border:** a 1 px `{colors.border}` hairline.
- **Internal Padding:** `{spacing.section}` (1.25 rem), `{spacing.screen}` above `sm`.
  The internal rows sit on a `{colors.panel}` well, darker than the card.

### Inputs / Fields
- **Style:** `{colors.panel}` background (a well, darker than the card carrying it), 1 px
  hairline, `{rounded.md}` corners, 44 px tall.
- **Focus:** the hairline turns `{colors.accent}`, with no glow.
- **Label:** a real label above the field, never a `placeholder` alone — it vanishes at
  the first keystroke, that is at the precise moment you check you are filling the right
  box, and a screen reader announces nothing but "edit text".
- **Checkbox:** 1.125 rem, `accent-color: {colors.brand}`, and it is the enclosing
  `<label>` that constitutes the target.

### Navigation
A sidebar above `lg`, a bottom bar below, with the same destinations. The active row
carries `{colors.card-raised}` and lemon ink; the others are in `{colors.muted}`. Lucide
icons, stroke 2, size 16–18 px, one family.

### The scoreboard
The signature component. Two Display scores either side of the clock, each preceded by an
8 px pill and the team's name. **Us in ink (`{colors.text}`), the opposition in accent
(`{colors.accent}`)**: the question asked is "us or them". The leading score is at full
opacity, the other at 0.85.

The number acknowledges the gesture that changed it, and the **direction** matters: it
rises because someone scored (`score-up`, 150 ms), it falls because someone undid
(`score-down`). It is the product's only authored motion, and it carries information
nothing else carries — *the gesture was taken, on this side*. Nothing on the first
render.

## Do's and Don'ts

### Do:
- **Do** let colour be carried by a **flat area** with its paired ink (`--c-*-fill` +
  `--c-on-*`). That is the fill rule, and it is the correction of three rejected
  palettes.
- **Do** use `--c-brand` to fill and `--c-accent` to write. In the dark theme the two are
  the same value; on light they diverge, and it is light that reveals the error.
- **Do** give every control 44 px of height, and move the action under the text below
  `sm`.
- **Do** point the shadcn tokens (`--card`, `--muted`, `--background`) at the `--c-*`
  planes. A second scale to within a per cent gets corrected twice and drifts.
- **Do** carry `.nums` on every number liable to change under the eye.
- **Do** compose the light theme **separately**. It is not derived from the dark one.
- **Do** check both themes before concluding. Dark forgives lemon everywhere; light does
  not.

### Don't:
- **Don't** add a shadow to detach an element. Spread the planes, lay a 1 px hairline.
- **Don't** veil a card (`bg-card/50`): the veil cancels half the separation of the
  planes.
- **Don't** use a raw Tailwind colour (`bg-red-600`, `text-emerald-700`). They are
  calibrated for a charcoal and fall outside the charter in both themes. The repo
  contains none, and that is a state worth preserving.
- **Don't** create a token family for a surface that "would not switch". It was tried
  twice — the scorer's table banner and the court — and both produced a black rectangle
  in the middle of a light application. Only the court's *colour convention* escapes the
  theme, never its surface.
- **Don't** colour a text or a chart series by a hash of an id. Reserved for crests.
- **Don't** put a field's name in its `placeholder` alone.
- **Don't** announce a contrast ratio in a comment. The figures go stale at the first hue
  adjustment and nobody recomputes them; they live in `src/ui/theme/contrast.test.ts`,
  which reads the CSS back and redoes the calculation.
- **Don't** add motion to make the finish visible. One authored moment exists (the score
  answering), and infinite motion is cut under `prefers-reduced-motion` without removing
  the acknowledgement.
