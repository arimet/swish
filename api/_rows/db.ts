import pg from 'pg'
import type { QueryResult, QueryResultRow } from 'pg'

/*
 * `date` columns come back as the text Postgres stores ("2026-09-30"), which is the
 * domain's own shape. The driver's default builds a `Date` at local midnight, and a
 * server west of UTC would then hand every game back one day early.
 */
pg.types.setTypeParser(1082, (v: string) => v)

/** What the stores need from a connection: a pool, a pooled client inside a
 *  transaction, or the script's own client all qualify. */
export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>
}

/** One document kind, read from its view and written to its table. */
export interface Store<T> {
  list(db: Db): Promise<T[]>
  get(db: Db, id: string): Promise<T | null>
  put(db: Db, id: string, doc: T): Promise<void>
  archive(db: Db, id: string): Promise<void>
}

/** A refusal the client caused, answered `400` rather than `500`. */
export class BadRequest extends Error {}

/** The constraint a Postgres error names, when it is an integrity violation (class
 *  23: foreign key, check, not null, unique). Anything else is ours, not the client's. */
export function constraintOf(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string; message?: string }
  if (typeof err?.code !== 'string' || !err.code.startsWith('23')) return null
  return err.constraint ?? err.message ?? err.code
}

/** Drops the keys a row holds as `null`: the domain spells "absent" by leaving the
 *  field out, and a document read back must equal the one written. */
export function compact<T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as never
}

/** A `timestamptz` as the domain writes it, full ISO. */
export const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString())

/**
 * The store of a kind that is one row in one table.
 *
 * The row's keys are the SQL column names, so the statement is built from them and a
 * column cannot be written under one name and read under another.
 */
export function tableStore<T, R extends QueryResultRow>(o: {
  table: string
  view: string
  key: keyof R & string
  columns: (keyof R & string)[]
  toRow: (doc: T) => R
  fromRow: (row: R) => T
  /** `false` for a table with no `archived_at`: its `put` must not try to reset it. */
  archivable?: boolean
}): Store<T> {
  const cols = o.columns.join(', ')
  const params = o.columns.map((_, i) => `$${i + 1}`).join(', ')
  const updates = o.columns.filter((c) => c !== o.key).map((c) => `${c} = excluded.${c}`)
  if (o.archivable !== false) updates.push('archived_at = null')
  const upsert = `insert into ${o.table} (${cols}) values (${params})
    on conflict (${o.key}) do update set ${updates.join(', ')}`
  return {
    async list(db) {
      return (await db.query<R>(`select ${cols} from ${o.view}`)).rows.map(o.fromRow)
    },
    async get(db, id) {
      const { rows } = await db.query<R>(`select ${cols} from ${o.view} where ${o.key} = $1`, [id])
      return rows[0] ? o.fromRow(rows[0]) : null
    },
    async put(db, id, doc) {
      const row = { ...o.toRow(doc), [o.key]: id } as R
      await db.query(upsert, o.columns.map((c) => row[c]))
    },
    async archive(db, id) {
      if (o.archivable === false) throw new BadRequest(`${o.table} cannot be archived on its own`)
      await db.query(`update ${o.table} set archived_at = now() where ${o.key} = $1 and archived_at is null`, [id])
    },
  }
}
