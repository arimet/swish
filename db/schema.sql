-- Swish — the source of truth.
--
-- One table, JSON documents. The application is document-oriented end to end:
-- Dexie stores whole objects, the queue already emits { kind, op, id, doc }. Eight
-- relational tables would demand eight migrations for every field added, for data
-- nobody queries by column.
--
-- To apply on a fresh database:
--   psql "$DATABASE_URL" -f db/schema.sql

create sequence if not exists documents_rev;

create table if not exists documents (
  kind        text        not null,
  id          text        not null,

  doc         jsonb       not null,

  -- WHEN THE PERSON MADE THE CHANGE, on their device, at the moment of the gesture.
  -- This is what arbitrates conflicts, and certainly not the time of arrival: a
  -- queue held up for two hours by a gym with no coverage must not overwrite a
  -- correction made meanwhile on another device.
  modified_at timestamptz not null,

  -- IN WHICH ORDER THE SERVER WROTE. A sequence, hence a strict total order: this
  -- is the hydration cursor, and nothing else. Timestamps can cross, a sequence
  -- cannot.
  rev         bigint      not null default nextval('documents_rev'),

  primary key (kind, id)
);

-- Incremental hydration reads "everything that moved since `rev`".
create index if not exists documents_rev_idx on documents (rev);

-- The spectator view finds a club's roster without scanning the table.
create index if not exists documents_team_idx
  on documents ((doc ->> 'teamId')) where kind = 'player';

-- The table holds only the living: a deletion removes the row. The other devices
-- learn of it from the absence of the id in the manifest returned by
-- `GET /api/state`, not from a tombstone that could expire.
