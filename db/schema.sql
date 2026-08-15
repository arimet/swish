-- Swish — la source de vérité.
--
-- Une seule table, des documents JSON. L'application est orientée document de bout
-- en bout : Dexie range des objets entiers, la file d'attente émet déjà
-- { kind, op, id, doc }. Huit tables relationnelles demanderaient huit migrations
-- à chaque champ ajouté, pour une donnée que personne n'interroge par colonne.
--
-- À appliquer sur une base neuve :
--   psql "$DATABASE_URL" -f db/schema.sql

create sequence if not exists documents_rev;

create table if not exists documents (
  kind        text        not null,
  id          text        not null,

  doc         jsonb       not null,

  -- QUAND LA PERSONNE A MODIFIÉ, sur son appareil, au moment du geste.
  -- C'est lui qui arbitre les conflits, et surtout pas l'heure d'arrivée : une
  -- file bloquée deux heures par un gymnase sans réseau ne doit pas écraser une
  -- correction faite entre-temps sur un autre appareil.
  modified_at timestamptz not null,

  -- DANS QUEL ORDRE LE SERVEUR A ÉCRIT. Une séquence, donc un ordre total strict :
  -- c'est le curseur d'hydratation, et rien d'autre. Des horodatages peuvent se
  -- croiser, une séquence non.
  rev         bigint      not null default nextval('documents_rev'),

  primary key (kind, id)
);

-- L'hydratation incrémentale lit « tout ce qui a bougé depuis `rev` ».
create index if not exists documents_rev_idx on documents (rev);

-- Le suivi spectateur retrouve l'effectif d'un club sans parcourir la table.
create index if not exists documents_team_idx
  on documents ((doc ->> 'teamId')) where kind = 'player';

-- La table ne contient que du vivant : une suppression supprime la ligne. Les
-- autres appareils l'apprennent par l'absence de l'identifiant du manifeste que
-- renvoie `GET /api/state`, pas par une pierre tombale qui pourrait expirer.
