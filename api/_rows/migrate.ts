import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './db.js'

/**
 * Applies the migrations not yet recorded, in file-name order, each in its own
 * transaction. Returns the names applied.
 *
 * Twenty lines rather than a migration library: the files are plain SQL, the order is
 * the name, and the only state is one table of names.
 */
export async function migrate(db: Db, dir = 'db/migrations'): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name))
  const applied: string[] = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue
    await db.query('begin')
    try {
      await db.query(readFileSync(join(dir, name), 'utf8'))
      await db.query('insert into schema_migrations (name) values ($1)', [name])
      await db.query('commit')
    } catch (e) {
      await db.query('rollback')
      throw e
    }
    applied.push(name)
  }
  return applied
}

/** Drops everything the migrations created, the old `documents` table included.
 *  Destructive by name: `db:reset` and the test harness only. */
export async function dropAll(db: Db): Promise<void> {
  await db.query('drop schema public cascade')
  await db.query('create schema public')
}
