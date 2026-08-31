# Swish — your team's basketball hub

A scoresheet, a game clock, statistics and tactical plays for **one** amateur basketball
team. You keep the sheet from the sideline; the club gets back a season of usable data
without anyone re-typing a thing.

Swish runs on **one shared Postgres database and nothing else**: no account to create,
one place where the club's data lives, the same for every phone at the table, on the
bench and in the stands. Spectators follow a game live from a link.

> 🇫🇷 **The product itself ships in French by default** — that is deliberate, it was
> built for a French club and its vocabulary follows the French federation's rules.
> English is a first-class second language inside the app, switchable from the header of
> every screen. This document, and the design charter it links to, are the reference for
> anyone picking up the code.

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

Two documents describe the product and its visual identity, and they are authoritative
for anyone picking up the code:

- **[PRODUCT.md](PRODUCT.md)** — who Swish is for, what it does, what it will not do,
  and the constraints future work must preserve.
- **[DESIGN.md](DESIGN.md)** — the design charter: colour tokens, typography, named
  rules. Read it before touching a screen. *(Written in French, like the product.)*

## Licence

**[PolyForm Noncommercial 1.0.0](LICENSE)** — use it, fork it, change it, share it, for
any noncommercial purpose. A club, an association, a school, personal use, research or
teaching are all fine, and no permission is needed.

What it does not allow is building a commercial product or service out of it. If that is
what you want, ask the author.

One consequence worth knowing: a noncommercial restriction means this is **not** "open
source" in the OSI sense, and GitHub will show the licence as *non-standard*. That is
the deliberate trade — freedom to use and fork, without the freedom to sell.
