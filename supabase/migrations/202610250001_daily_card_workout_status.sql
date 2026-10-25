-- A missing workout entry is unknown, not a recorded rest day.
alter table public.daily_cards add column if not exists had_workout boolean;

update public.daily_cards
set had_workout = true
where had_workout is null
  and (nullif(btrim(workout_type), '') is not null or workout_minutes > 0);
