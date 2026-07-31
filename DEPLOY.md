# Deployment (Vercel) & realtime sync

Swish runs **fully offline** (IndexedDB) with zero configuration. Sharing data
across machines and **realtime spectator following** are optional and turn on
with a Redis store.

## 1. Deploy the frontend to Vercel

- Import the repo into Vercel (the **Vite** preset is auto-detected).
- Build: `pnpm build`, output: `dist/`.
- The `api/` folder is deployed as **serverless functions** (including the SSE
  stream on the Edge runtime) — nothing to configure.

With no extra environment variable, the app runs in local mode (data stays on
each device; spectator following is same-device only).

## 2. Enable sharing + realtime (multi-device)

1. In the Vercel project: **Storage → create a KV database** (Upstash Redis).
   Vercel then injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Add the environment variable **`VITE_SYNC_URL=/api`** (Production).
3. Redeploy.

Now **data is shared across every machine**: teams, players and the schedule
created on one device show up on the others. The app stays **local-first**
(IndexedDB cache): it keeps working offline and re-syncs when the network is
back. Without `VITE_SYNC_URL`, everything stays purely local per device.

Optional: `VITE_ADMIN_PASSWORD` to change the admin password (default `admin`).

## 3. Demo data

For a demo (deployment pre-filled with teams / championship / matches), add
**`VITE_SEED=1`** and redeploy. Every device that opens the app is seeded with a
data set. In shared mode the seed only runs when the store is empty, so it never
overwrites shared data. Remove the variable for real use.

## How it works

- **Shared entities** (teams, players, matches): each write goes to the local
  cache immediately and is queued to the server (`POST /api/mutate`,
  best-effort). On startup the app hydrates from `GET /api/state`; list pages
  refresh from it. Offline writes are flushed when the connection returns.
- **Live following**: the scorer's table publishes the full match state
  (`PUT /api/match/:id`) on every action. Spectators open `…/match/:id/watch`
  and receive live updates over **SSE** (`GET /api/match/:id/stream`), falling
  back to polling if the stream is unavailable.
- Live match snapshots are kept for **12 h** (TTL); shared entities persist.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SYNC_URL=/api` | Enable shared data + realtime following | Optional |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis store | Auto (Vercel KV) |
| `VITE_SEED=1` | Seed demo data | Demo only |
| `VITE_ADMIN_PASSWORD` | Admin password (default `admin`) | Optional |

> `VITE_*` variables are read at **build time** — always redeploy after changing them.

## Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/state` | All shared entities (teams, players, matches) |
| `POST` | `/api/mutate` | Apply a batch of upserts/deletes |
| `GET`  | `/api/match/:id` | Current match snapshot (JSON) |
| `PUT`  | `/api/match/:id` | Publish match state (scorer's table) |
| `GET`  | `/api/match/:id/stream` | Realtime SSE stream (Edge) |
