# Deployment (Vercel) & realtime sync

Swish runs **fully offline** (IndexedDB) with zero configuration. Sharing data
across machines and **realtime spectator following** are optional and turn on
with a Postgres database.

Once sharing is on, **the database is the source of truth** and each device
keeps a mirror of it so the app still works in a gym with no signal.

## 1. Deploy the frontend to Vercel

- Import the repo into Vercel (the **Vite** preset is auto-detected).
- Build: `pnpm build`, output: `dist/`.
- The `api/` folder is deployed as **serverless functions** (including the SSE
  stream) — nothing to configure.

With no extra environment variable, the app runs in local mode (data stays on
each device; spectator following is same-device only).

## 2. Enable sharing + realtime (multi-device)

1. In the Vercel project: **Storage → create a Postgres database** (Neon).
   Vercel then injects `DATABASE_URL`. Use the **pooled** connection string —
   its host ends in `-pooler` — because serverless functions hold no connection.
2. Create the table: `psql "$DATABASE_URL" -f db/schema.sql`.
3. Add **`SYNC_WRITE_TOKEN`** — any long random string. It guards every read and
   write of club data. Without it the API refuses to serve at all, on purpose:
   an open database is worse than a broken one.
4. Add **`VITE_SYNC_URL=/api`** (Production) and redeploy.
5. On each device: **Administration → Synchronisation**, paste the token, and
   press *Save and check*. The device says whether the server accepted it.

Now **data is shared across every machine**: teams, players and the schedule
created on one device show up on the others. The app stays **local-first**: it
keeps working offline and re-syncs when the network is back. Without
`VITE_SYNC_URL`, everything stays purely local per device.

> ### ⚠️ Turning sync on is a one-way door for a device's local data
>
> The database is the source of truth, **without exception**: a device adopts
> what the server holds, including when the server holds nothing. The first time
> a device syncs against a fresh database, its own local data is replaced by the
> server's — plays, team message and trainings included.
>
> This is not a failure of sync. Data that was never synced was never in the
> system of record, and a mirror that has never reflected anything is not a
> backup. Set sync up **before** a club starts entering a season, not after.

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
> bundle and readable in the browser's dev tools. And the write endpoints
> `api/mutate.ts` and `api/match/[id].ts` accept writes with no authentication
> and `Access-Control-Allow-Origin: *`, so the UI can be bypassed outright. The
> three accesses guard against
> accidents between people who trust each other, not against a malicious third
> party. Do not deploy shared data you would mind seeing altered.

## 4. Demo data

For a demo (deployment pre-filled with teams / championship / matches), add
**`VITE_SEED=1`** and redeploy. Every device that opens the app is seeded with a
data set. In shared mode the seed only runs when the store is empty, so it never
overwrites shared data. Remove the variable for real use.

## How it works

- **Everything a club owns is shared**: teams, players, matches, call-ups,
  trainings, plays, entered results and the coach's message — eight kinds, all of
  them. Each write goes to the local
  mirror immediately and is queued to the server (`POST /api/mutate`). On
  startup the app hydrates from `GET /api/state`; list pages refresh from it.
  Offline writes are flushed when the connection returns.
- **Conflicts are settled by when the change was *made*, not when it arrived.**
  Each queued write carries the moment the person made it, and an older change
  arriving late cannot overwrite a newer one — which is what happens when a
  device spends a game offline and empties its queue two hours later.
- **Deletions really delete the row.** Other devices learn about them because
  `GET /api/state` also returns the list of ids the database still holds;
  anything missing from it is dropped locally.
- **Live following**: spectators open `…/match/:id/watch` and receive updates
  over **SSE** (`GET /api/match/:id/stream`), falling back to polling if the
  stream is unavailable. The payload is derived from the database — nothing is
  published separately, and nothing expires.
- Everything persists. There is no TTL.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SYNC_URL=/api` | Enable shared data + realtime following | Optional |
| `DATABASE_URL` | Postgres (use the pooled host) | Auto (Vercel/Neon) |
| `SYNC_WRITE_TOKEN` | Guards club data; entered once per device | With `VITE_SYNC_URL` |
| `VITE_SEED=1` | Seed demo data | Demo only |
| `VITE_ADMIN_PASSWORD` | Admin access code (fallback `admin`) | Recommended |
| `VITE_SCORER_PASSWORD` | Scorer's table access code (fallback `marque`) | Recommended |
| `VITE_PLAYER_PASSWORD` | Player identification code, no write access (fallback `joueur`) | Recommended |

> `VITE_*` variables are read at **build time** — always redeploy after changing them.

## Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/state?since=<rev>` | Changed documents + the ids still alive. **Token required.** |
| `POST` | `/api/mutate` | Apply a batch of upserts/deletes. **Token required.** |
| `GET`  | `/api/match/:id` | Spectator payload, derived from the database. Public. |
| `GET`  | `/api/match/:id/stream` | Realtime SSE stream (Edge) |
