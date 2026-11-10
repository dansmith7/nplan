alter table public.telegram_calendar_changes
  drop constraint telegram_calendar_changes_kind_check,
  add constraint telegram_calendar_changes_kind_check check (kind in ('created', 'moved', 'cancelled')),
  alter column before_start drop not null,
  add constraint telegram_calendar_changes_times_check check (
    (kind = 'created' and before_start is null and after_start is not null and after_end > after_start)
    or (kind in ('moved', 'cancelled') and before_start is not null)
  );

-- Existing links have no first-import timestamp. New ones get the snapshot's
-- transaction timestamp, which stays unchanged on subsequent upserts.
alter table public.google_calendar_event_links add column first_imported_at timestamptz;
alter table public.google_calendar_event_links alter column first_imported_at set default now();

create function public.queue_new_google_meeting_alerts()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.last_success_at is null or old.lease_id is null
     or new.lease_id is not null or new.last_error_code is not null
     or new.last_success_at is distinct from now() then
    return new;
  end if;

  -- Strip the occurrence suffix produced by the importer to group a series.
  with links as materialized (
    select g.*, regexp_replace(g.source_id,
      '@[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$', '') as series_key
    from public.google_calendar_event_links g
    where g.user_id = new.user_id
  ), first_meetings as (
    select distinct on (g.series_key) g.*
    from links g
    where g.first_imported_at = now() and g.last_seen_run = old.lease_id
      and g.active and g.starts_at > now()
      and not exists (
        select 1 from links previous
        where previous.series_key = g.series_key
          and previous.first_imported_at is distinct from now()
      )
    order by g.series_key, g.starts_at, g.source_id
  )
  insert into public.telegram_calendar_changes (
    user_id, source_id, revision, kind, title, after_start, after_end
  )
  select user_id, source_id, change_revision, 'created', source_title, starts_at, ends_at
  from first_meetings
  on conflict (user_id, source_id, revision) do nothing;

  return new;
end;
$$;
revoke all on function public.queue_new_google_meeting_alerts() from public, anon, authenticated;

create trigger google_calendar_new_meeting_alerts
after update of last_success_at on public.google_calendar_sync_state
for each row execute function public.queue_new_google_meeting_alerts();

create or replace function public.current_telegram_calendar_change(p_user_id uuid, p_id uuid)
returns setof public.telegram_calendar_changes language sql stable set search_path = '' as $$
  select c.* from public.telegram_calendar_changes c
  join public.google_calendar_event_links g
    on g.user_id = c.user_id and g.source_id = c.source_id and g.change_revision = c.revision
  join public.google_calendar_sync_state s on s.user_id = c.user_id
  where c.user_id = p_user_id and c.id = p_id
    and s.last_success_at >= now() - interval '3 minutes'
    and (s.lease_id is null or s.lease_until < now())
    and (
      (c.kind = 'cancelled' and not g.active)
      or (
        c.kind in ('moved', 'created') and g.active
        and g.starts_at = c.after_start and g.ends_at = c.after_end
        and (c.kind <> 'created' or g.starts_at > now())
      )
    );
$$;
