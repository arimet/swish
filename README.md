# Swish — your team's basketball hub

A scoresheet, a game clock, statistics and tactical plays for **one** amateur basketball
team. You keep the sheet from the sideline; the club gets back a season of usable data
without anyone re-typing a thing.

Swish runs **offline, with no account and no configuration**. Data lives on the device.
Sharing between devices and live spectator following are optional, and turn on with a
Postgres database.

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

A read-only link (`/match/:id/watch`) shows the score, clock and statistics live. Built
to be projected in the hall as much as opened on a phone. Locally it follows a game on
the same device; with sync enabled, from anywhere.

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

- **The demo data** (`src/dev/seed.ts`) contains a real club's roster. It only loads in
  development, or in production if you set `VITE_SEED=1`. For real use: leave that
  variable unset, and replace the file if you want your own demo.
- **The vocabulary follows FFBB rules** (French federation): four 10-minute periods,
  bonus on the fifth team foul, 2/1 standings. If your federation differs, it is all
  gathered in `src/rules/ffbb.ts` and `src/domain/`.
- **The English translation** covers the interface. A missing key falls back to French
  rather than showing an identifier. Catalogues live in `src/i18n/`.
- **The product's copy is French-first.** If you translate further, the French catalogue
  is the reference — see `src/i18n/fr.ts`.

---

## Running locally

```bash
pnpm install
pnpm dev
```

The app opens on `http://localhost:5173` with demo data. It works entirely offline, with
no server — **no database needed to develop the app itself**.

### Working on the sync

Only if you are changing how devices share data. Everything under `api/` then runs
inside the Vite dev server, so `/api/*` behaves exactly as it does on Vercel — no
Vercel CLI, no linked project.

```bash
docker compose up -d
```

```bash
psql "postgres://swish:swish@localhost:5433/swish" -f db/schema.sql
```

Then put this in a `.env` (see `.env.example`) and restart `pnpm dev`:

```bash
printf 'DATABASE_URL=postgres://swish:swish@localhost:5433/swish\nSYNC_WRITE_TOKEN=dev\nVITE_SYNC_URL=/api\n' >> .env
```

The dev server prints which mode it started in. Enter the token once under
**Administration → Synchronisation**. Without `DATABASE_URL`, none of this is
mounted and `pnpm dev` behaves exactly as above.

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

### 1. The bare minimum

Import the repository into Vercel — the **Vite** preset is detected automatically, and
the `api/` folder is deployed as serverless functions. With no environment variable at
all, the app runs in **local mode**: each device keeps its own data, and spectator
following works on the same device.

That is a complete, usable deployment. A scorer's table needs nothing more.

### 2. Making sync work

Sync shares data between devices **and** powers remote spectator following. Three steps:

1. In the Vercel project: **Storage → create a Postgres database** (Neon). Vercel
   then injects `DATABASE_URL` — use the pooled connection string.
2. Create the table: `psql "$DATABASE_URL" -f db/schema.sql`.
3. Set **`SYNC_WRITE_TOKEN`** to a long random string, add **`VITE_SYNC_URL=/api`**,
   and redeploy. Each device **that writes** enters the token once, under
   Administration; reading needs nothing. See [DEPLOY.md](DEPLOY.md) for what that
   makes public.

Once sharing is on, the database is the source of truth and each device keeps a
mirror so the app still works in a gym with no signal. Read `DEPLOY.md` first:
turning sync on replaces a device's local data with the server's.
3. Redeploy.

Teams, players and the schedule created on one device now show up on the others. The app
stays **local-first**: it keeps working offline and flushes its queued writes when the
network returns.

How it works, in two lines: every write goes to the local cache and then to a queue
(`POST /api/mutate`); on startup the app hydrates from `GET /api/state`; the scorer's
table publishes the full match state on every action (`PUT /api/match/:id`) and
spectators receive it over **SSE** (`GET /api/match/:id/stream`), falling back to
polling. Match snapshots are kept for 12 h.

### 3. Setting the access codes

**All three codes have a fallback, and it applies in production too.** Setting only the
admin code leaves the scorer's table open on the French word `marque`.

| Variable | Unlocks | Fallback |
|---|---|---|
| `VITE_ADMIN_PASSWORD` | Roster, schedule, call-ups, trainings, results, stat corrections | `admin` |
| `VITE_SCORER_PASSWORD` | Starting a game, points, fouls, substitutions, clock, finishing | `marque` |
| `VITE_PLAYER_PASSWORD` | Nothing in write. Only picking your own name on the roster | `joueur` |

> **What these codes are not.** They are `VITE_*` variables: compiled into the bundle and
> readable in the browser's dev tools. The write endpoints `api/mutate.ts` and
> `api/match/[id].ts` accept writes with no authentication. These accesses guard against
> accidents between people who trust each other, not against a malicious third party. Do
> not share data you would mind seeing altered.

### All variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SYNC_URL=/api` | Shared data + live following | Optional |
| `DATABASE_URL` | Postgres (pooled host) | Auto (Vercel/Neon) |
| `SYNC_WRITE_TOKEN` | Guards writes (reading is public) | With `VITE_SYNC_URL` |
| `VITE_SEED=1` | Demo data | Demo only |
| `VITE_ADMIN_PASSWORD` | Administrator code (fallback `admin`) | Recommended |
| `VITE_SCORER_PASSWORD` | Scorer's table code (fallback `marque`) | Recommended |
| `VITE_PLAYER_PASSWORD` | Player code, no write access (fallback `joueur`) | Recommended |

---

## Under the hood

React 19, Vite, TypeScript, Tailwind v4, react-router, Dexie (IndexedDB), installable
offline PWA. Tests with Vitest. The serverless functions in `api/` exist only for
optional sync.

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
