-- Swish — the source of truth, and the only one.
--
-- One table, JSON documents. The application is document-oriented end to end: the
-- screens read and write whole objects, the API speaks { kind, op, id, doc }. Eight
-- relational tables would demand eight migrations for every field added, for data
-- nobody queries by column.
--
-- To apply on a fresh database:
--   psql "$DATABASE_URL" -f db/schema.sql

create table if not exists documents (
  kind text  not null,
  id   text  not null,
  doc  jsonb not null,

  primary key (kind, id)
);

-- The spectator view finds a club's roster without scanning the table.
create index if not exists documents_team_idx
  on documents ((doc ->> 'teamId')) where kind = 'player';

-- There is no `rev`, no `modified_at` and no tombstone, because there is no local
-- mirror to reconcile any more: every read goes to this table and every write lands
-- in it before the screen believes it. A deletion removes the row, full stop.
