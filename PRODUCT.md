# Product

<!-- impeccable:product-schema 1 -->

> Written in English at the owner's request, like the README. The product itself is
> **French-first**: French is the default and the reference, with English available from
> the header of every screen so other clubs can fork it. `DESIGN.md` stays in French.
> That is a commitment, not drift — see Brand Commitments.

## Platform

web

## Users

**Primary: the volunteer at the scorer's table**, during a home or away game. Often the
coach, because a dedicated volunteer is not always available — the access model assumes
this explicitly (an administrator also holds scoring rights; the reverse is not true).
They work standing, on a phone or tablet, one-handed, in a gym, while the game runs.
They cannot look away for long and cannot afford a mis-tap.

**The club manager** sets things up outside match time, usually seated: roster, calendar,
convocations, tactical plays, entered results. Same device or another, no account.

**Players** read. A player can bind their identity to a device once (via a shared code)
so their own line is highlighted in the roster and their profile is one tap away. This
grants no write access.

**Spectators** — parents, club members — follow a match from a shared link, either
projected in the gym or opened remotely.

Roles are unlocked by **shared codes**, not accounts: `visiteur` (default, read-only),
`marque` (scoring), `admin` (club management), plus a separate player-identity code. The
role lives in the tab's session and dies with it; the player identity persists on the
device.

## Product Purpose

Keep the scoresheet of an amateur basketball match — score, clock, fouls, timeouts,
substitutions, located shots — and turn those entries into something the club can use
afterwards: box scores, shooting charts, playing time, season standings.

The two halves are one product. Clubs already have paper and the federation's own tool
for the first half; what they do not have is the second half falling out of the first
for free. Swish exists so that a season of matches, entered once by a volunteer, becomes
a season of usable data without anyone re-typing anything.

Success: a volunteer gets through a full match without fighting the app, and the club
finds the match sheet, the player profiles and the standings correct afterwards.

## Positioning

**A single-team hub, deliberately asymmetric.** A match is detailed only on our side of
the sheet; the opponent is a global score with no roster. This is a documented decision
(`docs/superpowers/specs/2026-08-10-mono-equipe-design.md`), not an unfinished feature,
and it is what a league-wide tool cannot copy: it makes entry fast enough for one
volunteer, and it makes the data useful without requiring anyone else in the league to
adopt anything. Standings and other teams are context, not the core.

**One shared database, no account.** The club's data lives in one place and every
device reads and writes there. A phone at the table, one on the bench and one in the
stands are looking at the same season, with nothing to reconcile. The cost is stated
rather than hidden: no network, no application.

## Operating Context

- **A gym.** Glare, distance, noise; the device is held, not placed. The network is the
  one thing the application cannot do without — a hall with no coverage is a hall where
  the sheet cannot be kept, and that is a known, accepted limit.
- **FFBB rules** (French federation) govern the domain, and they differ from NBA
  defaults in ways that matter: four periods of 10 minutes then overtimes of 5,
  team-foul **bonus at 5** (not 4), standings scored 2 points for a win and 1 for a
  loss, ties broken on point differential (`points for − points against`).
- **The season's rituals** the app follows: a championship pool ("Pré régionale
  masculine" in current use), a convocation before each match carrying a meeting time
  and place, and roughly two training sessions a week, each with a theme and optionally
  attached tactical plays.
- **Away matches** are entered on the volunteer's own device, which is why the roster
  and calendar must already be there before leaving.
- **Spectator following** happens by sharing a link to a read-only live view, designed
  to be projected in the hall as well as opened on a phone.

## Capabilities and Constraints

**Confirmed capabilities.** Match setup and calendar; live scoring (points by type,
missed shots, fouls by type, timeouts, substitutions, period management, clock with
manual correction and undo); shots located on a FIBA half or full court with zone
attribution; per-player box score and playing time; shooting charts per player and per
team; standings computed from our own matches plus manually entered outside results;
convocations; a tactical-plays library with a step-by-step reader and share-by-link (the
whole play travels in the URL fragment, so the recipient needs no installed app); one
team message from the coach; PDF export of the match sheet; administrative bulk cleanup;
read-only spectator live view.

**A single source of truth, and it is the database.** One Postgres table of JSON
documents behind `api/`, required, not optional; see `DEPLOY.md`. Everything a club owns
lives there — teams, players, matches, call-ups, trainings, plays, entered results and
the coach's message — which is what lets a player read their call-up on their own phone
instead of only on the coach's.

There used to be a mirror on each device, and it was defended by exactly the argument
above: a gym has no signal, and the scorer's table writes hundreds of times over two
hours. It was dropped anyway, and the reasoning is worth keeping. Two copies of the
truth cost a hydration cursor, a manifest of the living, a per-device conflict
arbitration on the time of the *gesture*, and a whole class of defect where a phone
showed a state the database did not have. For an official score, a screen that lies is
worse than an action refused.

Two rules follow, and they are the ones to keep in mind when changing this area. A write
is not a write until the server has answered — every screen that shows the result of one
must roll back when it fails, as `useMatch` does. And **a write replaces**: there is no
merge left to soften it, because a merge only ever reconciles copies and there are none.
A match sheet is therefore kept by one device at a time; the day two need to record the
same game, the fix is for the server to own the event log — appending events rather than
accepting a rewritten one — not for a merge to come back.

The shareable spectator link is public by design and carries only shirt numbers and
names; licence numbers, birth dates and heights never leave the database.

**Failures announce themselves.** When the server is silent or refuses the device's
token, every screen — including the scoring table, which lives outside the app shell and
needed its own copy — shows it, for as long as it lasts. It is deliberately not a toast:
a gym with no signal lasts two hours, and a fading message would be gone before the
volunteer looked up. And the wording deliberately does **not** reassure: there is no
queue behind it any more, so "nothing is lost" would be false in the direction that costs
a scorer their last basket.

**Single-team by design.** An opponent never has a roster. Any feature that would
require entering the other side's players contradicts the positioning above.

**Not everything is shared.** The role held in a tab, the player identity bound to a
device, the chosen club, the language and the theme are device settings and stay put.
A tablet lent to the opposing team must not push those onto it.

**Terminology is French and is part of the product**, not a localisation layer: *table
de marque* (scorer's table), *e-marque* (the federation's electronic sheet), *convocation*
(call-up), *schéma* (tactical play), *poule* (pool), *bonus*. Surnames are stored and
displayed in capitals, matching how the entry screens write them.

**Explicitly undecided.** Whether the export must be usable for an official FFBB
declaration, or remains a club convenience for archiving and sharing. The PWA manifest
currently advertises an "export e-marque". Future work must not resolve this in either
direction on its own: if it becomes binding, format fidelity and numeric exactness turn
into hard constraints.

## Brand Commitments

- **Name:** Swish.
- **Language:** French is the product's language and its default. The users are a French
  amateur club, and the vocabulary follows the federation's own terms; a French-first
  interface is a commitment, not an accident of who wrote it.
  **English exists alongside it**, switchable from the header of every screen, so other
  clubs can fork Swish and use it — the README makes that offer, and it would be hollow
  if the interface stayed monolingual. The two are not equal: French is the reference,
  and a key missing from English falls back to French rather than showing an
  identifier. Adding a screen means adding both, and the catalogue test fails on a key
  the French side does not have.
- **Voice:** plain and factual, the vocabulary of a coach and a scorer rather than of
  software. Controls name the action; errors name the problem and the recovery.
- The visual world lives in `DESIGN.md` and is not restated here.

## Evidence on Hand

- **A real roster** — eleven named players of the Avenir de Vignot and their coach — in
  `src/dev/seed.ts`. Demo data: it reaches a database only through `pnpm db:seed`, never
  on its own.
- **Durable constraint on that roster: these are real people.** Birth dates and heights
  are deliberately left empty and must not be invented. Both fields are optional, the
  screens handle their absence, and they are filled from the team sheet by someone who
  actually knows. This applies to any future seed, fixture, screenshot or example.
- The seed's **scoring weights and playing roles are invented** and labelled as such in
  the file. One fact came from the club: BUZZI is the top scorer. Nothing else about
  individual performance is real.
- `DEPLOY.md` documents the actual deployment path (Vercel, optional Upstash KV, three
  access codes) and is accurate.
- Earlier design specs under `docs/superpowers/specs/` record the reasoning behind the
  single-team reorientation, the dashboard, the player profile, and the plays library.
- **Absent, and not to be fabricated:** user research, testimonials, adoption numbers,
  benchmarks, pricing, licensing, or any claim that the app is federation-approved.

## Product Principles

1. **The score is the product's truth.** Anything that lets the displayed score differ
   from the stored score is the most serious class of defect this product has — worse
   than a refused action, worse than an ugly screen.
2. **One volunteer, one hand, one gym.** Entry speed, target size and legibility at
   arm's length outrank feature breadth. A control that is hard to hit during a
   possession is a broken control, not a small one.
3. **Single-team asymmetry is the design, not a limitation.** Detail our side, total
   theirs. It is what keeps entry within one person's reach.
4. **One source of truth, and it must announce its own failures.** Two copies of the
   data cost more than the gym connection they buy. But a write that can fail silently
   is worse than one that is refused out loud.
5. **Never invent data about real people.** Empty is honest; plausible is not.

## Accessibility & Inclusion

The usage scene sets the bar, and it is stricter than a desk: a gym, glare, distance,
one hand, and a device that may be a five-year-old phone.

- **Contrast** is enforced by a test that reads the colour tokens from CSS and recomputes
  the ratios for both themes (`src/ui/theme/contrast.test.ts`) — WCAG AA for body text,
  AA-large for display numerals and components. Comments are not allowed to state
  ratios; the test does.
- **Targets:** 44 px minimum for anything touched, 24 px absolute floor even with a
  mouse.
- **Motion:** one authored moment (the score acknowledging the gesture). Under
  `prefers-reduced-motion` the movement is replaced rather than removed, so the
  acknowledgement survives.
- **Both themes ship** and both must be verified; the light theme reveals failures the
  dark one hides.
- Form controls carry real labels, never a placeholder standing in for the field name.
