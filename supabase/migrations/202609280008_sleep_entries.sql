create table public.sleep_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  bedtime time not null,
  wake_time time not null,
  awakenings smallint not null default 0 check (awakenings between 0 and 20),
  day_report jsonb check (day_report is null or (
    (day_report ? 'energy') and (day_report->>'energy')::smallint between 1 and 10 and
    (day_report ? 'sleepiness') and (day_report->>'sleepiness')::smallint between 1 and 10 and
    (day_report ? 'clarity') and (day_report->>'clarity')::smallint between 1 and 10 and
    (day_report ? 'mood') and (day_report->>'mood')::smallint between 1 and 10
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create index sleep_entries_user_day_idx on public.sleep_entries (user_id, day desc);
create trigger sleep_entries_updated_at before update on public.sleep_entries for each row execute function public.set_updated_at();
alter table public.sleep_entries enable row level security;
create policy "sleep entries are private" on public.sleep_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
