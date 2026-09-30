import pg from 'pg'
import { beforeAll, afterAll, beforeEach } from 'vitest'
import { dropAll, migrate } from './migrate.js'
import type { Db } from './db.js'

/**
 * A fresh schema on `TEST_DATABASE_URL`, for the tests that need Postgres itself —
 * a foreign key, a check, a view, a trigger — which no fake can vouch for.
 *
 * A variable of its own, never `DATABASE_URL`: this harness drops the whole schema
 * before the suite and empties every table before each test.
 */
export function testDb(): { ready: boolean; db: () => Db } {
  const url = process.env.TEST_DATABASE_URL
  let client: pg.Client | null = null
  if (url) {
    beforeAll(async () => {
      client = new pg.Client({ connectionString: url })
      await client.connect()
      await dropAll(client)
      await migrate(client)
    })
    beforeEach(async () => {
      await client!.query(`truncate teams, players, matches, match_roster, match_events, reported_results,
        convocations, convocation_players, trainings, plays, training_plays, team_messages restart identity`)
    })
    afterAll(async () => { await client?.end() })
  }
  return { ready: !!url, db: () => client! }
}
