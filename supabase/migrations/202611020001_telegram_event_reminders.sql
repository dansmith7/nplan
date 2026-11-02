-- Separate from desktop notification_log: three Telegram reminders per event occurrence.
create table public.telegram_event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  starts_at timestamptz not null,
  lead_minutes smallint not null check (lead_minutes in (60, 30, 10)),
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed', 'uncertain', 'skipped')),
  attempts smallint not null default 1,
  claimed_at timestamptz not null default now(),
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  telegram_message_id bigint,
  error_code text,
  unique (event_id, starts_at, lead_minutes)
);
alter table public.telegram_event_reminders enable row level security;
revoke all on public.telegram_event_reminders from public, anon, authenticated;
grant all on public.telegram_event_reminders to service_role;
create index telegram_reminders_retry_idx
  on public.telegram_event_reminders (user_id, next_attempt_at)
  where status = 'failed';

-- Read-only candidate query also powers the worker's dry run. No implicit repeats
-- from recurrence metadata: the planner materializes individual lesson occurrences.
create function public.due_telegram_event_reminders(p_user_id uuid, p_now timestamptz default now())
returns table (event_id uuid, starts_at timestamptz, lead_minutes smallint)
language sql stable set search_path = '' as $$
  select e.id, e.starts_at, lead.minutes::smallint
  from public.calendar_events e
  cross join (values (60), (30), (10)) lead(minutes)
  left join public.lesson_notes n on n.event_id = e.id
  left join public.telegram_event_reminders r
    on r.event_id = e.id and r.starts_at = e.starts_at and r.lead_minutes = lead.minutes
  where e.user_id = p_user_id and e.kind in ('lesson', 'meeting')
    and (e.kind <> 'lesson' or coalesce(n.status::text, 'scheduled') = 'scheduled')
    and e.starts_at > p_now and e.starts_at <= p_now + interval '60 minutes'
    and e.starts_at - make_interval(mins => lead.minutes) <= p_now
    and (
      (r.id is null and e.starts_at - make_interval(mins => lead.minutes) > p_now - interval '2 minutes')
      or (r.status = 'failed' and r.attempts < 3 and r.next_attempt_at <= p_now
          and e.starts_at - make_interval(mins => lead.minutes) > p_now - interval '5 minutes')
    )
  order by e.starts_at, lead.minutes desc limit 50;
$$;

create function public.claim_telegram_event_reminders(p_user_id uuid, p_now timestamptz default now())
returns setof public.telegram_event_reminders
language sql volatile set search_path = '' as $$
  insert into public.telegram_event_reminders as existing (user_id, event_id, starts_at, lead_minutes, claimed_at)
  select p_user_id, d.event_id, d.starts_at, d.lead_minutes, p_now
  from public.due_telegram_event_reminders(p_user_id, p_now) d
  on conflict (event_id, starts_at, lead_minutes) do update
    set status = 'sending', attempts = existing.attempts + 1, claimed_at = p_now,
        next_attempt_at = null, error_code = null
    where existing.status = 'failed' and existing.attempts < 3 and existing.next_attempt_at <= p_now
  returning existing.*;
$$;
revoke all on function public.due_telegram_event_reminders(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_telegram_event_reminders(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.due_telegram_event_reminders(uuid, timestamptz) to service_role;
grant execute on function public.claim_telegram_event_reminders(uuid, timestamptz) to service_role;
