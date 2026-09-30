# Deployment (Vercel) & realtime following

**One Postgres database, and it is the only source of truth.** Every screen reads
from it and every action writes to it before the screen believes itself saved.
There is no local store, no queue and no offline mode: without the network the
application does nothing, and it says so rather than pretending.

That is the trade, taken deliberately. A mirror on each device would let a gym with
no signal work, and would cost two truths to reconcile — a hydration cursor, a
manifest of the living, a per-device conflict arbitration, and a class of bug where
a phone shows data the database does not have. A scoreboard that refuses a basket is
better than one that shows 42 while the official sheet says 40.

## 1. Deploy the frontend to Vercel

- Import the repo into Vercel (the **Vite** preset is auto-detected).
- Build: `pnpm build`, output: `dist/`.
- The `api/` folder is deployed as **serverless functions** (including the SSE
  stream) — nothing to configure.

## 2. The database (required)

1. In the Vercel project: **Storage → create a Postgres database** (Neon).
   Vercel then injects `DATABASE_URL`. Use the **pooled** connection string —
   its host ends in `-pooler` — because serverless functions hold no connection.
2. Create the tables. On a **fresh** database, `DATABASE_URL=… pnpm db:init`
   applies the migrations in `db/migrations/`. A database that still holds the old
   `documents` table is upgraded once, differently: see
   [Upgrading from the `documents` table](#upgrading-from-the-documents-table-once).
3. Add **`WRITE_TOKEN`** — any long random string. It guards every **write**.
   Without it `POST /api/mutate` refuses, on purpose: an open database is worse
   than a broken one.
4. Redeploy.
5. On each device **that writes** — the scorer's table, the coach's phone:
   **Administration → Write access**, paste the token, and press *Save and
   check*. The device says whether the server accepted it. A device that only
   reads needs nothing: reading is public (see below).

### Migrations

The schema is the numbered SQL files in `db/migrations/`. `pnpm db:init` applies each
one once, in name order, each in its own transaction, and records it in
`schema_migrations`; running it again does nothing. The runner is
`api/_rows/migrate.ts`.

- **Never edit a migration that has been applied.** Add the next number.
- A migration that adds a column must also re-create the `active_*` view that exposes
  it: the views are `select t.*`, and Postgres freezes their column list when they are
  created.

```bash
DATABASE_URL=… pnpm db:reset
```

`db:reset` drops the whole schema (the old `documents` table included), re-applies the
migrations and re-seeds the demo season. It is destructive by name and by design — do
not point it at a club's season.

### Upgrading from the `documents` table (once)

A deployment from before the relational tables keeps everything in one `documents`
table, which nothing reads any more. There is no migration of its content: the move is
a reset.

1. Pick a moment with **no game in progress**: a sheet being scored during the move is
   lost with the rest.
2. `DATABASE_URL=<production pooled url> pnpm db:reset`. It drops the old table,
   applies the migrations **and seeds the demo season** — there is no command that
   leaves production empty. A club starting from nothing then uses **Administration →
   Erase everything**, which archives it all.
3. Redeploy.
4. **Reload every device that writes.** A tab left open from before still sends whole
   match sheets, which `POST /api/mutate` now refuses: its saves fail with an error
   until the page is reloaded, rather than silently dropping the events.

A device carrying an older build of the application also carries its service
worker, from the days when Swish worked offline. Two things remove it, and both are
needed:

- `src/main.tsx` un-registers whatever is found, on the way in;
- `public/sw.js` replaces the old worker with one that wipes the caches,
  un-registers itself and reloads the open windows.

The second is the one that actually reaches a stale phone. The first only runs if
the new build loads, and on a device the old worker still controls it never does —
the worker serves its precached shell, the new code is never executed, and the
application stays as it was until someone clears the site data by hand. The browser's
own way out is to re-fetch `/sw.js`; while no such file existed, the SPA rewrite
answered `index.html` as `text/html`, the update failed on the MIME type, and the
old worker was kept. Hence a real file at that exact path.

**Never remove `public/sw.js` without checking that no device still carries a
worker**, and never let the SPA rewrite swallow it: static files are matched before
rewrites, which is the whole reason this works.

### Keeping it alive between seasons

A managed database nobody queries for thirty days is treated as abandoned and
removed — Neon and the Redis add-ons in the Vercel marketplace both work this way
on their free plans. That is exactly the state Swish is in out of season: the last
game is in June, the club opens the application again in September, and nothing
has touched the database in between.

`vercel.json` therefore declares a cron job:

```json
"crons": [{ "path": "/api/ping", "schedule": "0 5 * * *" }]
```

Once a day, Vercel calls `/api/ping`, which reads one row from `teams`. It
reads a row rather than answering `select 1`, because what has to be proved is that
the **data** is in use, not that a connection can be opened.

Three things to know:

- **Cron jobs run on the production deployment only**, and never on previews. A
  project that is deployed but whose production is stale still ages out.
- **On the Hobby plan a cron runs once a day**, at some point inside the hour asked
  for. That is thirty pings per window, which is twenty-nine more than needed.
- **The cron is a deployment, not a setting.** It exists from the deploy that
  carries this `vercel.json`; changing the schedule means redeploying.

If a Redis is added later (there is none today — the SSE stream keeps its
subscribers in the function's memory), the same route is where its `PING` goes: one
call in the same handler, guarded by the presence of its URL, so the same daily
visit keeps both alive.

And because a keepalive only defends against forgetting, keep a dump of the season
somewhere that is not the same account:

```bash
pg_dump "$DATABASE_URL" -Fc -f swish-$(date +%F).dump
```

That is the answer to the other half of the risk — the provider that deletes the
database anyway, for a reason that has nothing to do with the last query.

## 3. Set the three access codes

The app has three independent access codes, each read from its own variable.
**All three fall back to a development default when the variable is unset — the
fallback applies in production too.** Setting only the admin one leaves the
scorer's table open on the French word `marque`, and `score` covers "finish the
match", which freezes the score for good.

| Variable | Unlocks | Fallback |
|---|---|---|
| `VITE_ADMIN_PASSWORD` | Roster, schedule, call-ups, trainings, championship results, post-game stat corrections | `admin` |
| `VITE_SCORER_PASSWORD` | Starting a match, points, fouls, substitutions, clock, finishing the match | `marque` |
| `VITE_PLAYER_PASSWORD` | Nothing in write. Only picking your own name in the roster, to see your stats | `joueur` |

> **What these codes are not.** They are `VITE_*` variables: compiled into the
> bundle and readable in the browser's dev tools. They guard against accidents
> between people who trust each other, not against a malicious third party.
>
> **And reading is public.** `GET /api/docs` carries no token: a visitor, a
> parent, a phone in private browsing all open the club rather than an empty
> application, with no device to provision. The price is stated plainly —
> `?kind=player` returns the roster as filed, licence numbers, birth dates and
> heights included, readable by anyone who knows the deployment's URL.
> `WRITE_TOKEN` guards writing, and writing alone. Do not deploy data you
> would mind seeing read.

## 4. Demo data

```bash
DATABASE_URL=… pnpm db:seed
```

It refuses a database that already holds teams, so it cannot erase a season by
accident. The application never seeds itself: filling the club's database is not
the front end's business, and a browser could only do it on a device already
carrying the write token.

## How it works

- **Everything a club owns is in relational tables**: `teams`, `players`, `matches`
  (with `match_roster` and `match_events`), `reported_results`, `convocations` (with
  `convocation_players`), `trainings`, `plays` (with `training_plays`) and
  `team_messages`. The client still speaks documents: a screen reads what it needs from
  `GET /api/docs?kind=…` when it mounts, and every write goes to `POST /api/mutate`,
  which maps each document to its rows; the screen rolls back if that fails.
- **A cascade is one batch, hence one transaction.** Deleting a team is a single
  `del`, and it is the views that do the rest.
- **Deleting archives.** Nothing is ever removed from an entity table: a delete sets
  `archived_at`, and the `active_*` views hide the row and whatever hangs off it (an
  archived team hides its players, games, results, sessions, plays and message).
  Un-archiving the parent brings them back, and writing an archived entity's id again
  un-archives it — an entity, not an event: an archived event stays archived, and
  sending its id again adds nothing. A call-up cannot be archived on its own: it
  follows its game. Only the link rows — roster, call-up, plays of a session — are
  really deleted.
- **A game's events are written one batch at a time**, through
  `POST /api/match/:id/events` (`{ add, archive }`, one transaction). A tap adds its own
  row and an undo archives one, so the sheet is never written whole: several devices can
  keep one game, each seeing the other's events. `mutate` writes a game's head and
  roster, never its events. The game clock is the exception: it runs on the device that
  started it.
- **A failed exchange is visible.** The header shows a pill for as long as the
  server is silent or refusing the token, and it does not claim anything is kept:
  nothing is.
- **The spectator link is public and carries only what the page shows**: shirt
  number and name. Licence numbers, birth dates and heights stay in the database.
- **Live following**: spectators open `…/match/:id/watch` and receive updates
  over **SSE** (`GET /api/match/:id/stream`), falling back to polling if the
  stream is unavailable. Every second the stream reads one number, `matches.rev`,
  which a trigger bumps on each event added or archived and which a write of the game
  bumps too; it builds and sends the game only when that number moves. The scorer's
  table follows the same stream, which is how a second device sees the first one's
  taps. The payload is derived from the database — nothing is published separately,
  and nothing expires.
- Everything persists. There is no TTL.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres (use the pooled host) — the source of truth | **Yes** |
| `WRITE_TOKEN` | Guards **writes**; entered once per writing device | **Yes** |
| `VITE_ADMIN_PASSWORD` | Admin access code (fallback `admin`) | Recommended |
| `VITE_SCORER_PASSWORD` | Scorer's table access code (fallback `marque`) | Recommended |
| `VITE_PLAYER_PASSWORD` | Player identification code, no write access (fallback `joueur`) | Recommended |

> `VITE_*` variables are read at **build time** — always redeploy after changing them.

## Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/docs?kind=<kind>[&id=<id>]` | Every document of a kind, or one of them. **Public.** |
| `POST` | `/api/mutate` | Apply a batch of upserts/deletes, in one transaction. **Token required.** |
| `POST` | `/api/match/:id/events` | Add and archive a game's events, in one transaction. **Token required.** |
| `GET`  | `/api/match/:id` | Spectator payload, projected from the database. Public. |
| `GET`  | `/api/match/:id/stream` | Realtime SSE stream (Node runtime) |
| `GET`  | `/api/ping` | Keepalive read, called daily by the cron. **Public.** |
