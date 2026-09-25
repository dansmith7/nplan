-- Manage a student's weekly schedule and materialize upcoming lesson events.

create unique index if not exists calendar_events_series_start_idx
  on public.calendar_events (recurrence_series_id, starts_at)
  where recurrence_series_id is not null;

create or replace function public.create_student_schedule(
  p_student_id uuid,
  p_weekday smallint,
  p_starts_at time,
  p_duration_minutes smallint default 60,
  p_timezone text default 'Europe/Istanbul',
  p_weeks smallint default 12
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_schedule_id uuid;
  v_student_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_weekday not between 0 and 6 then
    raise exception 'Weekday must be between 0 and 6';
  end if;

  if p_duration_minutes not between 15 and 480 then
    raise exception 'Duration must be between 15 and 480 minutes';
  end if;

  if p_weeks not between 1 and 52 then
    raise exception 'Weeks must be between 1 and 52';
  end if;

  select name
  into v_student_name
  from public.students
  where id = p_student_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Student not found';
  end if;

  insert into public.student_schedules (
    user_id,
    student_id,
    weekday,
    starts_at,
    duration_minutes,
    timezone
  )
  values (
    auth.uid(),
    p_student_id,
    p_weekday,
    p_starts_at,
    p_duration_minutes,
    p_timezone
  )
  returning id into v_schedule_id;

  insert into public.calendar_events (
    user_id,
    student_id,
    kind,
    title,
    starts_at,
    ends_at,
    recurrence,
    recurrence_series_id
  )
  select
    auth.uid(),
    p_student_id,
    'lesson',
    'Занятие · ' || v_student_name,
    (occurrence.day::date + p_starts_at) at time zone p_timezone,
    ((occurrence.day::date + p_starts_at) at time zone p_timezone)
      + make_interval(mins => p_duration_minutes),
    'weekly',
    v_schedule_id
  from generate_series(
    current_date,
    current_date + (p_weeks * 7),
    interval '1 day'
  ) as occurrence(day)
  where extract(dow from occurrence.day)::smallint = p_weekday
  on conflict (recurrence_series_id, starts_at)
    where recurrence_series_id is not null
    do nothing;

  return v_schedule_id;
end;
$$;

create or replace function public.remove_student_schedule(p_schedule_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.student_schedules
    where id = p_schedule_id
      and user_id = auth.uid()
  ) then
    raise exception 'Schedule not found';
  end if;

  delete from public.calendar_events
  where recurrence_series_id = p_schedule_id
    and user_id = auth.uid()
    and starts_at > now();

  delete from public.student_schedules
  where id = p_schedule_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.create_student_schedule(
  uuid, smallint, time, smallint, text, smallint
) from public;
revoke all on function public.remove_student_schedule(uuid) from public;

grant execute on function public.create_student_schedule(
  uuid, smallint, time, smallint, text, smallint
) to authenticated;
grant execute on function public.remove_student_schedule(uuid) to authenticated;
