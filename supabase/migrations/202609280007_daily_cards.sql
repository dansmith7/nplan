-- One private, editable card per calendar day. Nullable habit fields mean
-- "not recorded" rather than an implied negative answer.
create table public.daily_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  workout_type text check (char_length(workout_type) <= 120),
  workout_minutes smallint check (workout_minutes between 1 and 600),
  activity_note text check (char_length(activity_note) <= 500),
  had_sex boolean,
  alcohol_units smallint check (alcohol_units between 0 and 30),
  cigarettes smallint check (cigarettes between 0 and 100),
  ate_junk_food boolean,
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index daily_cards_user_day_idx on public.daily_cards (user_id, day desc);

create trigger daily_cards_updated_at
before update on public.daily_cards for each row execute function public.set_updated_at();

alter table public.daily_cards enable row level security;
create policy "daily cards are private" on public.daily_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
