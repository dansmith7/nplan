-- Avoid sending outdated Google reminders when synchronization stops or is in flight.
create or replace function public.due_telegram_event_reminders(p_user_id uuid, p_now timestamptz default now())
returns table (event_id uuid, starts_at timestamptz, lead_minutes smallint)
language sql stable set search_path = '' as $$
  select e.id, e.starts_at, lead.minutes::smallint
  from public.calendar_events e
  cross join (values (60), (30), (10)) lead(minutes)
  left join public.lesson_notes n on n.event_id = e.id
  left join public.telegram_event_reminders r
    on r.event_id = e.id and r.starts_at = e.starts_at and r.lead_minutes = lead.minutes
  left join public.google_calendar_event_links g on g.event_id=e.id and g.user_id=e.user_id
  left join public.google_calendar_sync_state s on s.user_id=g.user_id
  where (g.event_id is null or (g.active and s.last_success_at>=p_now-interval '3 minutes'
    and (s.lease_id is null or s.lease_until<p_now)))
    and e.user_id = p_user_id and e.kind in ('lesson', 'meeting')
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

