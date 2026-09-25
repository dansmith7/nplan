-- Keep tasks with a concrete time and their calendar cards in sync.
-- Tasks without a time remain outside the calendar by design.

create or replace function public.sync_task_to_calendar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  profile_timezone text;
  event_start timestamptz;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.due_date is null or new.due_time is null then
    delete from public.calendar_events where task_id = new.id;
    return new;
  end if;

  select timezone
    into profile_timezone
    from public.profiles
   where id = new.user_id;

  event_start := (new.due_date + new.due_time)
    at time zone coalesce(profile_timezone, 'Europe/Istanbul');

  insert into public.calendar_events (
    user_id,
    task_id,
    kind,
    title,
    description,
    starts_at,
    ends_at,
    recurrence
  )
  values (
    new.user_id,
    new.id,
    'task',
    new.title,
    new.description,
    event_start,
    event_start + interval '30 minutes',
    new.recurrence
  )
  on conflict (task_id) do update set
    kind = 'task',
    title = excluded.title,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    recurrence = excluded.recurrence,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_calendar_to_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  profile_timezone text;
  local_start timestamp;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.kind = 'task' and old.task_id is not null then
      update public.tasks set due_time = null where id = old.task_id;
    end if;
    return old;
  end if;

  if old.task_id is not null and old.task_id is distinct from new.task_id then
    update public.tasks set due_time = null where id = old.task_id;
  end if;

  if new.kind = 'task' and new.task_id is not null then
    select timezone
      into profile_timezone
      from public.profiles
     where id = new.user_id;

    local_start := new.starts_at
      at time zone coalesce(profile_timezone, 'Europe/Istanbul');

    update public.tasks
       set title = new.title,
           description = new.description,
           due_date = local_start::date,
           due_time = local_start::time,
           recurrence = new.recurrence
     where id = new.task_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_calendar on public.tasks;
create trigger tasks_sync_calendar
after insert or update of title, description, due_date, due_time, recurrence
on public.tasks
for each row execute function public.sync_task_to_calendar();

drop trigger if exists calendar_sync_tasks on public.calendar_events;
create trigger calendar_sync_tasks
after update or delete on public.calendar_events
for each row execute function public.sync_calendar_to_task();

insert into public.calendar_events (
  user_id,
  task_id,
  kind,
  title,
  description,
  starts_at,
  ends_at,
  recurrence
)
select
  task.user_id,
  task.id,
  'task',
  task.title,
  task.description,
  (task.due_date + task.due_time)
    at time zone coalesce(profile.timezone, 'Europe/Istanbul'),
  ((task.due_date + task.due_time)
    at time zone coalesce(profile.timezone, 'Europe/Istanbul')) + interval '30 minutes',
  task.recurrence
from public.tasks task
join public.profiles profile on profile.id = task.user_id
where task.due_date is not null
  and task.due_time is not null
on conflict (task_id) do update set
  kind = 'task',
  title = excluded.title,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  recurrence = excluded.recurrence,
  updated_at = now();
