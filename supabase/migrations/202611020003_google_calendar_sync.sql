-- Private, one-way Google import. OAuth tokens are never persisted.
create table public.google_calendar_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_email text not null default 'dankuzn2@gmail.com' check (account_email = 'dankuzn2@gmail.com'),
  organizer_email text not null default 'aseeva.alisa97@gmail.com' check (organizer_email = 'aseeva.alisa97@gmail.com'),
  lease_id uuid,
  lease_until timestamptz,
  last_success_at timestamptz,
  last_event_count integer,
  last_error_code text
);
create table public.google_calendar_event_links (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id text not null,
  google_id text not null,
  -- Retain the planner UUID across cancellation/restoration. Only this RPC owns it.
  event_id uuid not null default gen_random_uuid() unique,
  starts_at timestamptz not null,
  source_updated_at timestamptz,
  active boolean not null default true,
  last_seen_run uuid not null,
  primary key (user_id, source_id)
);
create index google_calendar_links_window_idx on public.google_calendar_event_links(user_id, starts_at) where active;
alter table public.google_calendar_sync_state enable row level security;
alter table public.google_calendar_event_links enable row level security;
revoke all on public.google_calendar_sync_state, public.google_calendar_event_links from public, anon, authenticated;
grant all on public.google_calendar_sync_state, public.google_calendar_event_links to service_role;

create function public.acquire_google_calendar_sync(p_user_id uuid)
returns uuid language sql volatile set search_path='' as $$
  insert into public.google_calendar_sync_state as s(user_id,lease_id,lease_until)
  values(p_user_id,gen_random_uuid(),now()+interval '60 seconds')
  on conflict(user_id) do update set lease_id=gen_random_uuid(),lease_until=now()+interval '60 seconds'
    where (s.lease_until is null or s.lease_until<now())
      and (s.last_success_at is null or s.last_success_at<now()-interval '25 seconds')
  returning lease_id;
$$;

create function public.apply_google_calendar_snapshot(
  p_user_id uuid, p_lease_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_events jsonb
) returns jsonb language plpgsql set search_path='' as $$
declare
  state public.google_calendar_sync_state;
  item jsonb;
  planner_id uuid;
  event_start timestamptz;
  event_end timestamptz;
  inserted_count integer:=0;
  updated_count integer:=0;
  removed_count integer:=0;
  changed_count integer;
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
  if (select count(distinct e->>'source_id') from jsonb_array_elements(p_events) e)<>jsonb_array_length(p_events) then
    raise exception 'Duplicate or missing Google identity';
  end if;
  for item in select * from jsonb_array_elements(p_events) loop
    event_start:=(item->>'starts_at')::timestamptz;
    event_end:=(item->>'ends_at')::timestamptz;
    if item->>'organizer_email' is distinct from state.organizer_email
      or coalesce(length(item->>'source_id'),0) not between 1 and 2000
      or coalesce(length(item->>'google_id'),0) not between 1 and 1024
      or coalesce(length(item->>'title'),0) not between 1 and 500
      or coalesce(length(item->>'description'),0)>50000
      or event_start is null or event_end is null or event_end<=event_start
      or event_start<p_window_start or event_start>=p_window_end then
      raise exception 'Invalid Google event';
    end if;
    insert into public.google_calendar_event_links(user_id,source_id,google_id,starts_at,source_updated_at,last_seen_run)
      values(p_user_id,item->>'source_id',item->>'google_id',event_start,(item->>'source_updated_at')::timestamptz,p_lease_id)
      on conflict(user_id,source_id) do update set
        google_id=excluded.google_id, starts_at=excluded.starts_at, source_updated_at=excluded.source_updated_at,
        active=true,last_seen_run=p_lease_id
      returning event_id into planner_id;
    if not exists(select 1 from public.calendar_events where id=planner_id) then
      inserted_count:=inserted_count+1;
    end if;
    insert into public.calendar_events as e(id,user_id,kind,title,description,starts_at,ends_at,recurrence)
      values(planner_id,p_user_id,'meeting',item->>'title',item->>'description',event_start,event_end,'none')
      on conflict(id) do update set title=excluded.title,description=excluded.description,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at
      where e.user_id=p_user_id and (e.title,e.description,e.starts_at,e.ends_at)
        is distinct from (excluded.title,excluded.description,excluded.starts_at,excluded.ends_at);
    get diagnostics changed_count=row_count;
    updated_count:=updated_count+changed_count;
  end loop;
  -- Reconcile only a complete, successful snapshot; never touch native NPlan events.
  with gone as (
    update public.google_calendar_event_links set active=false
    where user_id=p_user_id and active and starts_at>=p_window_start and starts_at<p_window_end
      and last_seen_run<>p_lease_id returning event_id
  ), removed as (
    delete from public.calendar_events where user_id=p_user_id and id in(select event_id from gone) returning id
  ) select count(*) into removed_count from removed;
  update public.google_calendar_sync_state set lease_id=null,lease_until=null,last_success_at=now(),
    last_event_count=jsonb_array_length(p_events),last_error_code=null where user_id=p_user_id;
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count-inserted_count,'removed',removed_count,'total',jsonb_array_length(p_events));
end $$;
revoke all on function public.acquire_google_calendar_sync(uuid) from public, anon, authenticated;
revoke all on function public.apply_google_calendar_snapshot(uuid,uuid,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.acquire_google_calendar_sync(uuid) to service_role;
grant execute on function public.apply_google_calendar_snapshot(uuid,uuid,timestamptz,timestamptz,jsonb) to service_role;
