-- Production lifecycle for students and lesson occurrences.

create type public.lesson_status as enum ('scheduled', 'held', 'cancelled');

alter table public.calendar_events
  drop constraint calendar_events_student_id_fkey,
  add constraint calendar_events_student_id_fkey
    foreign key (student_id) references public.students(id) on delete cascade;

alter table public.lesson_notes
  add column status public.lesson_status not null default 'scheduled',
  add column cancelled_at timestamptz,
  add constraint lesson_notes_status_timestamps_check check (
    (status = 'scheduled' and completed_at is null and cancelled_at is null)
    or (status = 'held' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and completed_at is null and cancelled_at is not null)
  );

create table public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  duration_minutes smallint not null default 60 check (duration_minutes between 15 and 480),
  timezone text not null default 'Europe/Istanbul',
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create unique index student_schedules_active_slot_idx
  on public.student_schedules (student_id, weekday, starts_at)
  where active;
create index student_schedules_user_student_idx
  on public.student_schedules (user_id, student_id);
create index lesson_notes_user_status_idx
  on public.lesson_notes (user_id, status, updated_at desc);

create or replace function public.ensure_lesson_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'lesson' then
    insert into public.lesson_notes (event_id, user_id)
    values (new.id, new.user_id)
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;

insert into public.lesson_notes (event_id, user_id)
select id, user_id
from public.calendar_events
where kind = 'lesson'
on conflict (event_id) do nothing;

create trigger calendar_events_ensure_lesson_note
after insert or update of kind on public.calendar_events
for each row execute function public.ensure_lesson_note();

create trigger student_schedules_updated_at
before update on public.student_schedules
for each row execute function public.set_updated_at();

alter table public.student_schedules enable row level security;
create policy "student schedules are private"
on public.student_schedules for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

