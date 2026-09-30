-- A missed free throw has no spot on the court: `MISS` needs one only for a field goal.
alter table match_events drop constraint event_shape;
alter table match_events add constraint event_shape check (
  case type
    when 'STARTING_FIVE' then team is not null
    when 'PERIOD_START' then true
    when 'PERIOD_END' then true
    when 'CLOCK_START' then true
    when 'CLOCK_STOP' then true
    when 'SCORE' then team is not null and score_kind is not null
    when 'MISS' then team is not null and player_id is not null and score_kind is not null
      and (shot_x is not null or score_kind = 'lf')
    when 'FOUL' then team is not null and foul_type is not null and foul_target is not null
      and (foul_target <> 'player' or player_id is not null)
    when 'TIMEOUT' then team is not null
    when 'SUBSTITUTION' then team is not null and player_in_id is not null and player_out_id is not null
    when 'STAT' then team is not null and player_id is not null and stat is not null
    else false
  end
);
