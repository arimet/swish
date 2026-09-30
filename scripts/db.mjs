/**
 * The database, from a terminal.
 *
 *   node scripts/db.mjs init    — apply the migrations (idempotent)
 *   node scripts/db.mjs seed    — fill it with the demo season
 *   node scripts/db.mjs reset   — drop it, re-create it, re-seed it
 *
 * The schema is the numbered files in `db/migrations/`, applied once each
 * (`api/_rows/migrate.ts`). `reset` drops everything and re-applies them.
 *
 * Plain `.mjs`, no build step, and **no new dependency**: `pg` already talks to the
 * database for `api/`, and Vite already compiles TypeScript for the application. The
 * seed is 700 lines of TypeScript that builds a plausible season, so rather than
 * duplicate it here we load that very module through Vite's SSR loader — the same
 * trick `dev-api.ts` uses to serve `api/` inside the dev server. One definition of
 * the demo data, two ways in.
 */
import { createServer, loadEnv } from 'vite'
import pg from 'pg'

const command = process.argv[2]
if (!['init', 'seed', 'reset'].includes(command)) {
  console.error('usage: node scripts/db.mjs init|seed|reset')
  process.exit(2)
}

// The same `.env` the dev server reads, so there is one place to put the connection
// string. An explicit environment variable still wins, which is what CI and a
// production shell will use.
const env = loadEnv('development', process.cwd(), '')
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set (put it in .env — see .env.example)')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

// The runner and the stores are TypeScript, in `api/`. Loaded through Vite's SSR
// loader, like the seed: one definition of the schema and of the mapping, whoever
// writes.
const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'warn' })
try {
  const { migrate, dropAll } = await vite.ssrLoadModule('/api/_rows/migrate.ts')
  if (command === 'reset') {
    await dropAll(client)
    console.log('· schema dropped')
  }
  const applied = await migrate(client)
  console.log(`· migrations applied: ${applied.length ? applied.join(', ') : 'none'}`)

  if (command !== 'init') {
    const { rows } = await client.query('select count(*)::int as n from teams')
    if (rows[0].n > 0) {
      console.error(`refusing to seed: the database already holds ${rows[0].n} teams (use \`reset\`)`)
      process.exit(1)
    }
    console.log(await seed(client, vite), 'documents written')
  }
} finally {
  await vite.close()
  await client.end()
}

/** Writes the demo season through the stores, in one transaction. The order matters:
 *  a player needs its team, a game its players, an event its game. */
async function seed(db, vite) {
  const { seedDocuments, SEED_CLUB_ID } = await vite.ssrLoadModule('/src/dev/seed.ts')
  const { store } = await vite.ssrLoadModule('/api/_rows/index.ts')
  const { writeEvents } = await vite.ssrLoadModule('/api/_rows/events.ts')
  const ORDER = ['team', 'player', 'play', 'match', 'result', 'convocation', 'training', 'message']
  const documents = seedDocuments().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  console.log(`· demo club: ${SEED_CLUB_ID}`)

  await db.query('begin')
  try {
    for (const { kind, id, doc } of documents) {
      await store(kind).put(db, id, doc)
      if (kind === 'match') await writeEvents(db, id, doc.events, [])
    }
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  }
  return documents.length
}
