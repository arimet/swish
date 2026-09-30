-- Swish — the club's data, as relational tables.
--
-- Nothing is deleted from an entity table: "delete" sets `archived_at`, and the
-- `active_*` views hide what is archived *and what hangs off something archived*.
-- Archiving a team therefore hides its players, games, results, sessions, plays and
-- message at once, and un-archiving it brings them all back. Only the link tables
-- (roster, call-up, session plays) lose rows for real: a box unticked is state, not
-- an entity anyone will want back.
--
-- No foreign key has an `on delete` action, since nothing is deleted. They are there
-- so that Postgres refuses a reference to an id that never existed.
--
-- The views are `select t.*`: Postgres freezes their column list when they are
-- created, so a migration that adds a column must re-create the view that exposes it.

create table teams (
  id text primary key,
  name text not null,
  coach text,
  archived_at timestamptz
);

create table players (
  id text primary key,
  team_id text not null references teams(id),
  number smallint not null,
  last_name text not null,
  first_name text not null,
  license text,
  birth_date date,
  height_cm smallint,
  archived_at timestamptz
);
create index players_team on players (team_id);

create table matches (
  id text primary key,
  club_id text not null references teams(id),
  opponent_id text not null references teams(id),
  status text not null check (status in ('setup', 'live', 'finished')),
  date date,
  time text,
  venue text,
  championship_label text,
  championship_code text,
  match_number text,
  pool text,
  referee1 text,
  referee2 text,
  referee3 text,
  coach_a text,
  -- Bumped by every change a follower must see: an event added or archived (trigger
  -- below), the game itself written (`put`). The live stream polls this number and
  -- nothing else.
  rev bigint not null default 0,
  archived_at timestamptz
);

create table match_roster (
  match_id text not null references matches(id),
  player_id text not null references players(id),
  rank smallint not null,
  -- The player's place in the starting five, null on the bench. A rank rather than a
  -- flag because the `STARTING_FIVE` event lists the five in an order the screens keep.
  starter_rank smallint,
  primary key (match_id, player_id)
);

create table match_events (
  id text primary key,
  match_id text not null references matches(id),
  seq bigint generated always as identity,
  wall_clock timestamptz not null,
  period smallint not null,
  game_clock integer not null,
  type text not null,
  team char(1) check (team in ('A', 'B')),
  player_id text references players(id),
  player_in_id text references players(id),
  player_out_id text references players(id),
  score_kind text check (score_kind in ('2int', '2ext', '3', 'lf')),
  stat text check (stat in ('assist', 'reb_off', 'reb_def', 'block')),
  foul_type text check (foul_type in ('personal', 'offensive', 'defensive', 'technical', 'unsportsmanlike', 'disqualifying')),
  foul_target text check (foul_target in ('player', 'coach', 'bench')),
  shot_x double precision,
  shot_y double precision,
  archived_at timestamptz,
  -- One shape per type: the columns each event needs, checked by the database rather
  -- than trusted from the client.
  constraint event_shape check (
    case type
      when 'STARTING_FIVE' then team is not null
      when 'PERIOD_START' then true
      when 'PERIOD_END' then true
      when 'CLOCK_START' then true
      when 'CLOCK_STOP' then true
      when 'SCORE' then team is not null and score_kind is not null
      when 'MISS' then team is not null and player_id is not null and score_kind is not null
        and shot_x is not null
      when 'FOUL' then team is not null and foul_type is not null and foul_target is not null
        and (foul_target <> 'player' or player_id is not null)
      when 'TIMEOUT' then team is not null
      when 'SUBSTITUTION' then team is not null and player_in_id is not null and player_out_id is not null
      when 'STAT' then team is not null and player_id is not null and stat is not null
      else false
    end
  ),
  constraint shot_pair check ((shot_x is null) = (shot_y is null))
);
create index match_events_match_seq on match_events (match_id, seq);

create function bump_match_rev() returns trigger language plpgsql as $$
begin
  update matches set rev = rev + 1 where id = new.match_id;
  return null;
end
$$;
create trigger match_events_rev after insert or update on match_events
  for each row execute function bump_match_rev();

create table reported_results (
  id text primary key,
  championship_label text not null,
  date date,
  home_id text not null references teams(id),
  away_id text not null references teams(id),
  home_score smallint not null,
  away_score smallint not null,
  archived_at timestamptz
);

create table convocations (
  match_id text primary key references matches(id),
  meet_time text,
  meet_place text,
  note text
);
create table convocation_players (
  match_id text not null references convocations(match_id),
  player_id text not null references players(id),
  rank smallint not null,
  primary key (match_id, player_id)
);

create table trainings (
  id text primary key,
  club_id text not null references teams(id),
  date date not null,
  time text,
  place text,
  theme text,
  archived_at timestamptz
);

create table plays (
  id text primary key,
  club_id text not null references teams(id),
  name text not null,
  note text,
  court text not null check (court in ('half', 'full')),
  defense boolean not null,
  folder text,
  -- `{ props, steps }`: geometry for the drawing, never queried by column.
  drawing jsonb not null,
  updated_at timestamptz,
  archived_at timestamptz
);

create table training_plays (
  training_id text not null references trainings(id),
  play_id text not null references plays(id),
  rank smallint not null,
  primary key (training_id, play_id)
);

create table team_messages (
  club_id text primary key references teams(id),
  text text not null,
  written_at timestamptz not null,
  archived_at timestamptz
);

create view active_teams as
  select t.* from teams t where t.archived_at is null;

create view active_players as
  select p.* from players p join teams t on t.id = p.team_id
  where p.archived_at is null and t.archived_at is null;

create view active_matches as
  select m.* from matches m
  join teams c on c.id = m.club_id
  join teams o on o.id = m.opponent_id
  where m.archived_at is null and c.archived_at is null and o.archived_at is null;

create view active_match_events as
  select e.* from match_events e where e.archived_at is null;

create view active_reported_results as
  select r.* from reported_results r
  join teams h on h.id = r.home_id
  join teams a on a.id = r.away_id
  where r.archived_at is null and h.archived_at is null and a.archived_at is null;

create view active_convocations as
  select c.* from convocations c join active_matches m on m.id = c.match_id;

create view active_trainings as
  select x.* from trainings x join teams t on t.id = x.club_id
  where x.archived_at is null and t.archived_at is null;

create view active_plays as
  select x.* from plays x join teams t on t.id = x.club_id
  where x.archived_at is null and t.archived_at is null;

create view active_team_messages as
  select x.* from team_messages x join teams t on t.id = x.club_id
  where x.archived_at is null and t.archived_at is null;
