-- Changes are queued in the same transaction as the successful Google snapshot.
-- Baseline imports and local NPlan edits never create alerts.
alter table public.google_calendar_event_links
  add column source_title text,
  add column ends_at timestamptz,
  add column change_revision integer not null default 0;
create table public.telegram_calendar_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id text not null,
  revision integer not null,
  kind text not null check(kind in ('moved','cancelled')),
  title text not null,
  before_start timestamptz not null,
  before_end timestamptz,
  after_start timestamptz,
  after_end timestamptz,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain','skipped')),
  attempts smallint not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  telegram_message_id bigint,
  error_code text,
  created_at timestamptz not null default now(),
  unique(user_id,source_id,revision),
  check(kind='cancelled' or (after_start is not null and after_end>after_start))
);
alter table public.telegram_calendar_changes enable row level security;
revoke all on public.telegram_calendar_changes from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_calendar_changes to service_role;
create index telegram_calendar_changes_pending_idx on public.telegram_calendar_changes(user_id,created_at)
  where status in ('pending','failed');

create or replace function public.apply_google_calendar_snapshot(
  p_user_id uuid,p_lease_id uuid,p_window_start timestamptz,p_window_end timestamptz,p_events jsonb
) returns jsonb language plpgsql set search_path='' as $$
declare
  state public.google_calendar_sync_state; item jsonb; previous public.google_calendar_event_links;
  planner_id uuid; event_start timestamptz; event_end timestamptz; version integer;
  inserted_count integer:=0; updated_count integer:=0; removed_count integer:=0;
  changed_count integer; total_count integer:=0;
begin
  select * into state from public.google_calendar_sync_state where user_id=p_user_id for update;
  if not found or p_lease_id is null or state.lease_until is null or state.lease_id is distinct from p_lease_id or state.lease_until<now() then
    raise exception 'Google sync lease is stale';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>1000
    or p_window_end<=p_window_start or p_window_end-p_window_start>interval '200 days'
    or p_window_start<now()-interval '15 days' or p_window_end>now()+interval '190 days' then
    raise exception 'Invalid Google snapshot';
  end if;
  if (select count(distinct e->>'source_id') from jsonb_array_elements(p_events)e)<>jsonb_array_length(p_events) then
    raise exception 'Duplicate or missing Google identity';
  end if;
  for item in select * from jsonb_array_elements(p_events) loop
    select * into previous from public.google_calendar_event_links where user_id=p_user_id and source_id=item->>'source_id' for update;
    if item->>'cancelled'='true' then
      -- Only a previously verified organizer's event, confirmed cancelled via
      -- events.get, may be called cancelled. Missing/declined/filtered != cancelled.
      if previous.user_id is null then raise exception 'Unknown cancelled event';end if;
      if previous.active then
        version:=previous.change_revision+1;
        if previous.starts_at>now() then
          insert into public.telegram_calendar_changes(user_id,source_id,revision,kind,title,before_start,before_end)
          values(p_user_id,previous.source_id,version,'cancelled',coalesce(previous.source_title,(select title from public.calendar_events where id=previous.event_id),'Встреча'),previous.starts_at,previous.ends_at);
        end if;
        update public.google_calendar_event_links set active=false,change_revision=version where user_id=p_user_id and source_id=previous.source_id;
        delete from public.calendar_events where user_id=p_user_id and id=previous.event_id;
        get diagnostics changed_count=row_count;removed_count:=removed_count+changed_count;
      end if;
      continue;
    end if;
    event_start:=(item->>'starts_at')::timestamptz;event_end:=(item->>'ends_at')::timestamptz;
    if item->>'organizer_email' is distinct from state.organizer_email
      or coalesce(length(item->>'source_id'),0) not between 1 and 2000
      or coalesce(length(item->>'google_id'),0) not between 1 and 1024
      or coalesce(length(item->>'title'),0) not between 1 and 500
      or coalesce(length(item->>'description'),0)>50000
      or event_start is null or event_end is null or not isfinite(event_start) or not isfinite(event_end) or event_end<=event_start
      or ((event_start<p_window_start or event_start>=p_window_end) and previous.user_id is null) then
      raise exception 'Invalid Google event';
    end if;
    total_count:=total_count+1;version:=coalesce(previous.change_revision,0);
    if previous.user_id is not null and (not previous.active or previous.starts_at is distinct from event_start or (previous.ends_at is not null and previous.ends_at is distinct from event_end)) then
      version:=version+1;
      if previous.active and (previous.starts_at>now() or event_start>now()) then
        insert into public.telegram_calendar_changes(user_id,source_id,revision,kind,title,before_start,before_end,after_start,after_end)
        values(p_user_id,previous.source_id,version,'moved',item->>'title',previous.starts_at,previous.ends_at,event_start,event_end);
      end if;
    end if;
    insert into public.google_calendar_event_links(user_id,source_id,google_id,starts_at,ends_at,source_title,source_updated_at,last_seen_run,change_revision)
      values(p_user_id,item->>'source_id',item->>'google_id',event_start,event_end,item->>'title',(item->>'source_updated_at')::timestamptz,p_lease_id,version)
      on conflict(user_id,source_id) do update set google_id=excluded.google_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
        source_title=excluded.source_title,source_updated_at=excluded.source_updated_at,active=true,last_seen_run=p_lease_id,change_revision=excluded.change_revision
      returning event_id into planner_id;
    if not exists(select 1 from public.calendar_events where id=planner_id) then inserted_count:=inserted_count+1;end if;
    insert into public.calendar_events as e(id,user_id,kind,title,description,starts_at,ends_at,recurrence)
      values(planner_id,p_user_id,'meeting',item->>'title',item->>'description',event_start,event_end,'none')
      on conflict(id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at
      where e.user_id=p_user_id and (e.title,e.description,e.starts_at,e.ends_at) is distinct from (excluded.title,excluded.description,excluded.starts_at,excluded.ends_at);
    get diagnostics changed_count=row_count;updated_count:=updated_count+changed_count;
  end loop;
  with gone as (
    update public.google_calendar_event_links set active=false,change_revision=change_revision+1
    where user_id=p_user_id and active and starts_at>=p_window_start and starts_at<p_window_end and last_seen_run<>p_lease_id returning event_id
  ), removed as (
    delete from public.calendar_events where user_id=p_user_id and id in(select event_id from gone) returning id
  ) select removed_count+count(*) into removed_count from removed;
  update public.google_calendar_sync_state set lease_id=null,lease_until=null,last_success_at=now(),last_event_count=total_count,last_error_code=null where user_id=p_user_id;
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count-inserted_count,'removed',removed_count,'total',total_count);
end $$;

create function public.current_telegram_calendar_change(p_user_id uuid,p_id uuid)
returns setof public.telegram_calendar_changes language sql stable set search_path='' as $$
 select c.* from public.telegram_calendar_changes c
 join public.google_calendar_event_links g on g.user_id=c.user_id and g.source_id=c.source_id and g.change_revision=c.revision
 join public.google_calendar_sync_state s on s.user_id=c.user_id
 where c.user_id=p_user_id and c.id=p_id
   and s.last_success_at>=now()-interval '3 minutes' and (s.lease_id is null or s.lease_until<now())
   and ((c.kind='cancelled' and not g.active) or (c.kind='moved' and g.active and g.starts_at=c.after_start and g.ends_at=c.after_end));
$$;
create function public.claim_telegram_calendar_changes(p_user_id uuid)
returns setof public.telegram_calendar_changes language plpgsql set search_path='' as $$
begin
 update public.telegram_calendar_changes c set status='skipped',error_code='superseded'
 where c.user_id=p_user_id and c.status in ('pending','failed') and not exists(
   select 1 from public.google_calendar_event_links g where g.user_id=c.user_id and g.source_id=c.source_id and g.change_revision=c.revision
 );
 return query with candidates as (
   select c.id from public.telegram_calendar_changes c
   where c.user_id=p_user_id and (c.status='pending' or (c.status='failed' and c.attempts<3 and c.next_attempt_at<=now()))
     and exists(select 1 from public.current_telegram_calendar_change(p_user_id,c.id))
   order by c.created_at limit 10 for update skip locked
 ) update public.telegram_calendar_changes c set status='sending',claimed_at=now(),attempts=c.attempts+1,next_attempt_at=null
   from candidates x where c.id=x.id returning c.*;
end $$;
revoke all on function public.current_telegram_calendar_change(uuid,uuid),public.claim_telegram_calendar_changes(uuid) from public,anon,authenticated;
grant execute on function public.current_telegram_calendar_change(uuid,uuid),public.claim_telegram_calendar_changes(uuid) to service_role;
