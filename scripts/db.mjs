/**
 * The database, from a terminal.
 *
 *   node scripts/db.mjs init    — create the table (idempotent)
 *   node scripts/db.mjs seed    — fill it with the demo season
 *   node scripts/db.mjs reset   — drop it, re-create it, re-seed it
 *
 * There is nothing else to run: the application has one table and no migrations.
 * When the shape of a document changes, the answer while this project is young is
 * `reset`, not a migration nobody will ever replay.
 *
 * Plain `.mjs`, no build step, and **no new dependency**: `pg` already talks to the
 * database for `api/`, and Vite already compiles TypeScript for the application. The
 * seed is 700 lines of TypeScript that builds a plausible season, so rather than
 * duplicate it here we load that very module through Vite's SSR loader — the same
 * trick `dev-api.ts` uses to serve `api/` inside the dev server. One definition of
 * the demo data, two ways in.
 */
import { readFileSync } from 'node:fs'
import { createServer, loadEnv } from 'vite'
import pg from 'pg'

const KINDS = ['team', 'player', 'match', 'result', 'convocation', 'training', 'play', 'message']

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

try {
  if (command === 'reset') {
    // Deliberately destructive, and the name says so. This is the command for a
    // project whose documents are still moving.
    await client.query('drop table if exists documents')
    console.log('· table dropped')
  }

  // Every command applies the schema, `seed` included: it is `create table if not
  // exists`, so it costs nothing on an existing table, and without it `db:seed` on a
  // fresh database failed with a raw Postgres stack trace — on the one command
  // someone is most likely to run first.
  await client.query(readFileSync('db/schema.sql', 'utf8'))
  console.log('· schema applied')

  if (command !== 'init') {
    const { rows } = await client.query('select count(*)::int as n from documents')
    if (rows[0].n > 0) {
      console.error(`refusing to seed: the table already holds ${rows[0].n} documents (use \`reset\`)`)
      process.exit(1)
    }
    console.log(await seed(client), 'documents written')
  }
} finally {
  await client.end()
}

/** Loads the application's own seed module and writes what it hands over. */
async function seed(db) {
  const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'warn' })
  let documents
  try {
    const module = await vite.ssrLoadModule('/src/dev/seed.ts')
    documents = module.seedDocuments()
    console.log(`· demo club: ${module.SEED_CLUB_ID}`)
  } finally {
    await vite.close()
  }

  // One transaction: a seed that lands half-written leaves games pointing at teams
  // that do not exist, and no screen can say so.
  await db.query('begin')
  try {
    for (const { kind, id, doc } of documents) {
      if (!KINDS.includes(kind)) throw new Error(`unknown kind: ${kind}`)
      await db.query(
        `insert into documents (kind, id, doc) values ($1, $2, $3)
         on conflict (kind, id) do update set doc = excluded.doc`,
        [kind, id, doc],
      )
    }
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  }
  return documents.length
}
