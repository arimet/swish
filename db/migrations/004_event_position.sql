-- Where an event stands in its game. `seq` is the order events arrived in; an action
-- corrected from the history is written where the one it replaces stood, so the order
-- read back is `position`: `seq` by default, a value between two neighbours for an
-- event inserted before another.
alter table match_events add column position double precision;
update match_events set position = seq;
alter table match_events alter column position set not null;

create function fill_event_position() returns trigger language plpgsql as $$
begin
  if new.position is null then new.position := new.seq; end if;
  return new;
end
$$;
create trigger match_events_position before insert on match_events
  for each row execute function fill_event_position();

create index match_events_match_position on match_events (match_id, position);

-- `e.*` was expanded when the view was made: re-made, it carries the new column.
drop view active_match_events;
create view active_match_events as
  select e.* from match_events e where e.archived_at is null;
