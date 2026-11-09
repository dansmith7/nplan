create table public.telegram_task_reminder_recipients (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint not null
);
alter table public.telegram_task_reminder_recipients enable row level security;
revoke all on public.telegram_task_reminder_recipients from public, anon, authenticated;

-- Reuse the verified private chat of an existing reminder recipient.
insert into public.telegram_task_reminder_recipients (user_id, chat_id)
select user_id, min(chat_id)
from public.telegram_quick_reminders
where telegram_message_id is not null
group by user_id
having count(distinct chat_id) = 1;

alter table public.telegram_quick_reminders
  add column task_id uuid references public.tasks(id) on delete cascade,
  add constraint task_deadline_reminder_is_one_shot check (task_id is null or series_id is null);
create unique index quick_reminders_task_idx on public.telegram_quick_reminders(task_id);

-- Adopt the earlier Friday batch instead of creating duplicate notifications.
update public.telegram_quick_reminders r
set task_id = t.id
from public.tasks t
where r.user_id = t.user_id and r.inbox_id is null and r.series_id is null
  and r.raw_text = 'task-deadline:2026-11-13:' || t.id;

create function public.sync_task_deadline_reminder(
  task public.tasks, reset_schedule boolean
)
returns void language plpgsql set search_path = '' as $$
declare
  recipient bigint;
  zone text;
  deadline timestamptz;
  reminder_title text;
begin
  select r.chat_id, coalesce(p.timezone, 'Europe/Istanbul')
    into recipient, zone
    from public.telegram_task_reminder_recipients r
    join public.profiles p on p.id = r.user_id
    where r.user_id = task.user_id;

  deadline := (task.due_date + coalesce(task.due_time, time '18:00')) at time zone zone;
  if task.status = 'completed' or deadline is null
     or (reset_schedule and deadline <= statement_timestamp()) then
    update public.telegram_quick_reminders
      set status = 'cancelled', revision = revision + 1, next_attempt_at = null,
          undo_snapshot = null, undo_until = null, updated_at = now()
      where task_id = task.id
        and (status not in ('done', 'cancelled') or undo_until is not null);
    return;
  end if;

  reminder_title := left(
    'Выполнить до ' || to_char(deadline at time zone zone, 'HH24:MI') || ': ' || task.title,
    500
  );
  if not reset_schedule then
    update public.telegram_quick_reminders
      set title = reminder_title, updated_at = now()
      where task_id = task.id and title is distinct from reminder_title;
    return;
  end if;

  insert into public.telegram_quick_reminders (
    task_id, user_id, chat_id, title, raw_text, timezone, due_at, status, offer_state
  ) values (
    task.id, task.user_id, recipient, reminder_title, 'Напоминание о дедлайне задачи', zone,
    greatest(statement_timestamp(), deadline - interval '1 hour'), 'scheduled', 'sent'
  )
  on conflict (task_id) do update set
    title = excluded.title, raw_text = excluded.raw_text, timezone = excluded.timezone,
    due_at = excluded.due_at, status = 'scheduled',
    revision = telegram_quick_reminders.revision + 1, attempts = 0,
    claimed_at = null, next_attempt_at = null, delivered_at = null,
    telegram_message_id = null, error_code = null, undo_snapshot = null,
    undo_until = null, updated_at = now();
end;
$$;
revoke all on function public.sync_task_deadline_reminder(public.tasks, boolean) from public, anon, authenticated;

create function public.on_task_deadline_reminder_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_task_deadline_reminder(new, true);
  elsif (old.due_date, old.due_time, old.status) is distinct from
        (new.due_date, new.due_time, new.status) then
    perform public.sync_task_deadline_reminder(new, true);
  elsif old.title is distinct from new.title then
    perform public.sync_task_deadline_reminder(new, false);
  end if;
  return new;
end;
$$;
revoke all on function public.on_task_deadline_reminder_change() from public, anon, authenticated;

create trigger tasks_sync_deadline_reminder
after insert or update of title, due_date, due_time, status on public.tasks
for each row execute function public.on_task_deadline_reminder_change();

-- Include existing open deadlines, excluding ones that already elapsed.
do $$
declare
  task public.tasks;
begin
  for task in
    select t.*
    from public.tasks t
    join public.telegram_task_reminder_recipients r on r.user_id = t.user_id
    where t.due_date is not null
    for update of t
  loop
    perform public.sync_task_deadline_reminder(task, true);
  end loop;
end;
$$;
