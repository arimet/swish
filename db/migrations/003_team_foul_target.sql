-- A foul charged to a team with no roster: the opposition's foul on an and-one.
alter table match_events drop constraint match_events_foul_target_check;
alter table match_events add constraint match_events_foul_target_check
  check (foul_target in ('player', 'coach', 'bench', 'team'));
