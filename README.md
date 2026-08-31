# Swish — your team's basketball hub

A scoresheet, a game clock, statistics and tactical plays for **one** amateur basketball
team. You keep the sheet from the sideline; the club gets back a season of usable data
without anyone re-typing a thing.

Swish runs on **one shared Postgres database and nothing else**: no account to create,
one place where the club's data lives, the same for every phone at the table, on the
bench and in the stands. Spectators follow a game live from a link.

> 🤖 **This project is vibecoded.** The code, the tests, the comments and this file were
> written by an LLM (Claude) in conversation with the author, over one month and 192
> commits. Read the section below before you read the code — it changes what you should
> trust and what you should check.

> 🇫🇷 **The product itself ships in French by default** — that is deliberate, it was
> built for a French club and its vocabulary follows the French federation's rules.
> English is a first-class second language inside the app, switchable from the header of
> every screen. This document, and the design charter it links to, are the reference for
> anyone picking up the code.

---

## How this was built

Swish was **vibecoded**: the author decided what the product is and rejected what it is
not, and an LLM wrote it. That is not a disclaimer bolted on afterwards — it is the
single most useful fact about this codebase, so it belongs before the tour.

One month, 192 commits, ~21 800 lines of which **7 400 are tests**. The author is a
developer and reviewed the work; the product decisions, the FFBB rules, the refusals and
the design charter are theirs. The typing was not.

**Why the comments are so long.** A codebase built this way has no oral tradition behind
it. Nobody can be asked at the coffee machine why the arrow snaps at six per cent of the
court, why a cascade is one transaction, or why the write token is checked with a *write*
and not a read. So the reasons are written down where the decision lives, in the shape
"here is the defect this prevents" rather than "here is what this line does". You will
find defects described in the past tense throughout — those are real ones that shipped,
kept as the argument for the code that replaced them.

**Why a third of the lines are tests.** They are the only thing that survives a
conversation. A rule agreed in chat and not encoded is a rule the next session breaks:
the palette's contrast ratios are measured from the CSS rather than claimed in a comment,
the translation catalogue is confronted with the keys the sources actually use, and the
cascades keep a "two deletions in quick succession" case because that exact defect
shipped once.

**What to trust, and what to check.** Consistency across files is better than a team of
humans would keep up: the same naming, the same shape, the same idiom everywhere.
Judgement in the corners is worse — a rule stated confidently in a comment while the code
next to it does something slightly different is the failure mode of this method, and it
happened here more than once. **When a comment and a test disagree, the test is the one
that ran.** For a live example: this file and `PRODUCT.md` both stated that `DESIGN.md`
was written in French, for two weeks after it had been translated to English. Neither
sentence was wrong when written, and nothing failed when it stopped being true.

None of this is an argument for or against building software this way. It is what you
need to know to work on it.

---

## What Swish does

### The scorer's table

The heart of the product, made to be held one-handed in a gym, with a thumb, while the
game is running.

- **Scoring** by shot type: free throw, two-point inside or outside, three-pointer.
  Every basket is credited to a player.
- **Game clock** with start, stop, and buzzer correction (±1 s, ±10 s, direct entry).
- **Fouls** by player and by type, with the team **bonus** flagged from the fifth foul
  of the period — the FIBA/FFBB rule, not the NBA one.
- **Timeouts**, **substitutions**, period and overtime management.
- **Located shots** on a FIBA half court: a tap places the shot, the zone is derived
  from the real court geometry.
- **Undo** of the last action, and targeted correction of a specific one.
- Every entry is persisted before it counts: if the write fails, the screen returns to
  the stored state and says so.

### After the game

- **Full box score**: points, made and missed shots, percentages, assists, offensive and
  defensive rebounds, blocks, fouls, playing time.
- **Shot charts** per player and per team, with hot zones.
- **PDF export** of the sheet, printable or archivable.
- **Post-game stat correction**, administrator only.

### The season

- **Schedule** of games and training sessions, grouped by date.
- **Call-ups**: who is called, meeting time and place.
- **Standings** computed from your own games, completed with other teams' results
  entered by hand (win = 2 pts, loss = 1 pt, ties broken on point differential).
- **Player profiles**: cumulative statistics, averages, shot chart, playing time.
- **Team message** from the coach on the dashboard.

### Tactical plays

- **Editor** for half-court or full-court plays, with pieces, ball, runs, screens,
  passes and dribbles.
- **Player** that steps through the play, designed for a timeout: full screen,
  one-handed, with or without the movement lines shown.
- **Share by link**: the whole play travels in the URL, so the recipient installs
  nothing.
- **Library** organised in folders, and plays attachable to a training session.

### Spectator following

A read-only link (`/match/:id/watch`) shows the score, clock and statistics live, from
anywhere. Built to be projected in the hall as much as opened on a phone. It carries
shirt numbers and names, nothing more: the link is public by design.

### Access

Three independent codes, no accounts: **visitor** (read-only, the default), **scorer's
table** (enter a game) and **administrator** (manage the club). A fourth code lets a
player identify themselves on the roster to find their own profile — with no write
access at all.

### Two languages, two themes

The interface exists in **French** (default) and **English**, with a toggle in the
header. Dark theme by default, a fully composed light theme, toggle in the same place.

---

## Forking Swish for your club

Swish is the hub of **one** team, and that is deliberate: you never enter an opponent's
roster, a game is detailed only on your side. That is what keeps entry within one
volunteer's reach. Nothing in the code is specific to the original club — fork it,
deploy it, and create your team on first launch.

Before you fork:

- **The demo data** (`src/dev/seed.ts`) contains a real club's roster. Nothing loads it
  on its own: it reaches a database only when someone runs `pnpm db:seed`. Replace the
  file if you want your own demo.
- **The vocabulary follows FFBB rules** (French federation): four 10-minute periods,
  bonus on the fifth team foul, 2/1 standings. If your federation differs, it is all
  gathered in `src/rules/ffbb.ts` and `src/domain/`.
- **The English translation** covers the interface. A missing key falls back to French
  rather than showing an identifier. Catalogues live in `src/i18n/`.
- **The product's copy is French-first.** If you translate further, the French catalogue
  is the reference — see `src/i18n/fr.ts`.

---

## Running locally

**A database is required.** It is the only place the application's data lives, so
without one every screen is empty. Everything under `api/` runs inside the Vite dev
server, so `/api/*` behaves exactly as it does on Vercel — no Vercel CLI, no linked
project.

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
printf 'DATABASE_URL=postgres://swish:swish@localhost:5433/swish\nWRITE_TOKEN=dev\n' >> .env
```

```bash
pnpm db:reset
```

```bash
pnpm dev
```

`db:reset` creates the table and fills it with the demo season — a club, its roster,
five games (one live), the standings, two months of practices and three plays. The
app opens on `http://localhost:5173` already full.

To **write** from the app you also need the token: paste `dev` once under
Administration → Write access. Reading needs nothing, which is why the screens fill
up before you do anything.

| Command | What it does |
|---|---|
| `pnpm db:init` | Creates the table if it is not there. Touches no data. |
| `pnpm db:seed` | Creates the table if needed, then fills it with the demo season. Refuses a table that already holds documents. |
| `pnpm db:reset` | Drops the table, re-creates it, re-seeds it. Destructive. |

There are no migrations: while the documents are still moving, `db:reset` is the
answer to a change of shape.

Other useful commands:

```bash
pnpm test
```

```bash
pnpm build
```

---

## Deploying to production

The full guide is in **[DEPLOY.md](DEPLOY.md)**. In short:

### 1. The database, which is not optional

1. Import the repository into Vercel — the **Vite** preset is detected automatically,
   and the `api/` folder is deployed as serverless functions.
2. **Storage → create a Postgres database** (Neon). Vercel then injects
   `DATABASE_URL` — use the pooled connection string.
3. Create the table: `psql "$DATABASE_URL" -f db/schema.sql`.
4. Set **`WRITE_TOKEN`** to a long random string and redeploy. Each device **that
   writes** enters it once, under Administration → Write access; reading needs
   nothing. See [DEPLOY.md](DEPLOY.md) for what that makes public.
5. **Put the functions in the database's region.** `vercel.json` pins `lhr1` (London),
   because the original deployment's Neon lives in `eu-west-2`. **If yours is
   elsewhere, change that line** — Vercel's default is `iad1` (Washington), and a
   function in Washington querying a database in London crossed the Atlantic twice per
   read: 300 to 500 ms instead of 120, on screens that read four to seven documents on
   mount. Nothing on screen explains that latency, which is why it is a step here and a
   note beside the pool in `api/_db.ts`.

How it works, in two lines: a screen reads what it needs from `GET /api/docs?kind=…`
and every write goes straight to `POST /api/mutate`, which answers before the screen
believes itself saved. Spectators receive a game over **SSE**
(`GET /api/match/:id/stream`), falling back to polling.

### 2. Setting the access codes

**All three codes have a fallback, and it applies in production too.** Setting only the
admin code leaves the scorer's table open on the French word `marque`.

| Variable | Unlocks | Fallback |
|---|---|---|
| `VITE_ADMIN_PASSWORD` | Roster, schedule, call-ups, trainings, results, stat corrections | `admin` |
| `VITE_SCORER_PASSWORD` | Starting a game, points, fouls, substitutions, clock, finishing | `marque` |
| `VITE_PLAYER_PASSWORD` | Nothing in write. Only picking your own name on the roster | `joueur` |

> **What these codes are not.** They are `VITE_*` variables: compiled into the bundle and
> readable in the browser's dev tools. They guard against accidents between people who
> trust each other, not against a malicious third party. The door the server actually
> guards is `WRITE_TOKEN`: without it, `POST /api/mutate` refuses.

### All variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres (pooled host) — the source of truth | **Yes** |
| `WRITE_TOKEN` | Guards writes (reading is public) | **Yes** |
| `VITE_ADMIN_PASSWORD` | Administrator code (fallback `admin`) | Recommended |
| `VITE_SCORER_PASSWORD` | Scorer's table code (fallback `marque`) | Recommended |
| `VITE_PLAYER_PASSWORD` | Player code, no write access (fallback `joueur`) | Recommended |

---

## Under the hood

React 19, Vite, TypeScript, Tailwind v4, react-router. Tests with Vitest. The serverless
functions in `api/` are the only way to the data: one Postgres table of JSON documents,
read through `GET /api/docs` and written through `POST /api/mutate`.

**Every read goes through React Query**, in `src/persistence/queries.ts`. The screens
used to fetch in `useEffect` and hold the answer in `useState`, which meant a screen
re-read everything each time it mounted. Four things replaced that, and each is worth
knowing before touching a screen:

- **One cache entry per kind.** `usePlayers(teamId)` is a `select` over the whole
  `player` entry, not a query of its own — two teams' rosters share one request, and a
  write invalidates one thing rather than a family of near-duplicates. Measured in the
  browser: seven requests on first load, then **zero** across seven navigations.
- **Stale-while-revalidate**, past thirty seconds. The screen draws from the cache
  immediately and refetches behind it; nothing waits for the network to paint.
- **A refetch when the device comes back**, on focus and on reconnect. A phone that
  slept through half-time catches up on its own.
- **Invalidation by key.** `WriteBridge` subscribes to accepted writes and files the
  document the server took, so a `put` costs no read back. Adding a player in the
  browser issues `POST /api/mutate` and one `GET docs?kind=player` — nothing else. A
  gesture in the play editor issues the `POST` alone.

The cost is **+9 kB gzipped** on the initial bundle (113 → 122 kB).

**Writes call the repositories directly**, and the bridge above is what keeps the cache
honest — so no call site can forget to invalidate. Each screen used to keep a `reload()`
of its own, and the defects were always the forgotten one.

**The scorer's table is optimistic and rolls back.** An entry must answer the finger, so
the screen moves first; if the write fails, `src/app/useMatch.ts` puts the previous sheet
back and says so. A scoreboard showing 42 while the sheet holds 40 is worse than an
action refused. That hook applies its optimism **synchronously** rather than through
`useMutation.onMutate`, and the comment there says why: two taps land in the same tick,
and `onMutate` runs one microtask too late for the second to see the first.

Two documents describe the product and its visual identity, and they are authoritative
for anyone picking up the code:

- **[PRODUCT.md](PRODUCT.md)** — who Swish is for, what it does, what it will not do,
  and the constraints future work must preserve.
- **[DESIGN.md](DESIGN.md)** — the design charter: colour tokens, typography, named
  rules. Read it before touching a screen. Its named rules — the fill rule, the one-voice
  rule, the desk rule, the finger rule — are what the comments in `src/ui/` point at by
  name.

## Licence

**[PolyForm Noncommercial 1.0.0](LICENSE)** — use it, fork it, change it, share it, for
any noncommercial purpose. A club, an association, a school, personal use, research or
teaching are all fine, and no permission is needed.

What it does not allow is building a commercial product or service out of it. If that is
what you want, ask the author.

One consequence worth knowing: a noncommercial restriction means this is **not** "open
source" in the OSI sense, and GitHub will show the licence as *non-standard*. That is
the deliberate trade — freedom to use and fork, without the freedom to sell.
