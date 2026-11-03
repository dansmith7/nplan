alter table public.telegram_quick_reminders alter column inbox_id drop not null;
alter table public.telegram_quick_reminders
  add column repeat_rule jsonb,
  add column proposed_repeat jsonb,
  add column occurrence_at timestamptz,
  add column repeat_retired boolean not null default false,
  add column undo_snapshot jsonb,
  add column undo_until timestamptz;
create table public.telegram_reminder_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id bigint not null,
  timezone text not null,
  title text not null check(length(btrim(title)) between 1 and 500),
  raw_text text not null,
  rule jsonb not null check(rule->>'kind' in ('daily','weekdays','weekly','monthly')),
  anchor_date date not null,
  anchor_reminder_id uuid references public.telegram_quick_reminders(id) on delete set null,
  active boolean not null default true,
  materialized_until date,
  created_at timestamptz not null default now()
);
alter table public.telegram_reminder_series enable row level security;
revoke all on public.telegram_reminder_series from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_reminder_series to service_role;
alter table public.telegram_quick_reminders add column series_id uuid references public.telegram_reminder_series(id) on delete cascade;
create unique index quick_reminder_occurrence_unique on public.telegram_quick_reminders(series_id,occurrence_at) where series_id is not null;
create index reminder_series_owner_idx on public.telegram_reminder_series(user_id) where active;

create function public.telegram_repeat_at(p_rule jsonb,p_day date,p_timezone text)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare last_day integer;
begin
  if p_rule->>'kind'='weekdays' and extract(isodow from p_day)>5 then return null; end if;
  if p_rule->>'kind'='weekly' and extract(isodow from p_day)<>(p_rule->>'weekday')::integer then return null; end if;
  if p_rule->>'kind'='monthly' then
    last_day:=extract(day from (date_trunc('month',p_day)+interval '1 month - 1 day'));
    if extract(day from p_day)<>least((p_rule->>'monthday')::integer,last_day) then return null; end if;
  end if;
  return (p_day+make_time((p_rule->>'hour')::integer,(p_rule->>'minute')::integer,0)) at time zone p_timezone;
end $$;
revoke all on function public.telegram_repeat_at(jsonb,date,text) from public,anon,authenticated;
grant execute on function public.telegram_repeat_at(jsonb,date,text) to service_role;

create function public.materialize_telegram_reminder_series(p_id uuid,p_now timestamptz default now())
returns integer language plpgsql set search_path = '' as $$
declare s public.telegram_reminder_series; d date; finish date; candidate timestamptz; inserted integer:=0; n integer;
begin
  select * into s from public.telegram_reminder_series where id=p_id for update;
  if not found or not s.active then return 0; end if;
  d:=greatest(s.anchor_date,(p_now at time zone s.timezone)::date);
  finish:=(p_now at time zone s.timezone)::date+400;
  while d<=finish loop
    candidate:=public.telegram_repeat_at(s.rule,d,s.timezone);
    if candidate>p_now and not exists(select 1 from public.telegram_quick_reminders where id=s.anchor_reminder_id and date_trunc('minute',due_at)=date_trunc('minute',candidate)) then
      insert into public.telegram_quick_reminders as old(user_id,chat_id,title,raw_text,timezone,series_id,repeat_rule,occurrence_at,due_at,status,offer_state)
      values(s.user_id,s.chat_id,s.title,s.raw_text,s.timezone,s.id,s.rule,candidate,candidate,'scheduled','sent')
      on conflict(series_id,occurrence_at) where series_id is not null do update
        set status='scheduled',due_at=excluded.due_at,title=excluded.title,repeat_rule=excluded.repeat_rule,repeat_retired=false,
          revision=old.revision+1,attempts=0,claimed_at=null,next_attempt_at=null,delivered_at=null,telegram_message_id=null,undo_snapshot=null,undo_until=null,updated_at=now()
        where old.status='cancelled' and old.repeat_retired
      returning 1 into n;
      if found then inserted:=inserted+1; end if;
    end if;
    d:=d+1;
  end loop;
  update public.telegram_reminder_series set materialized_until=finish where id=s.id;
  return inserted;
end $$;
revoke all on function public.materialize_telegram_reminder_series(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.materialize_telegram_reminder_series(uuid,timestamptz) to service_role;

create function public.set_telegram_reminder_repeat(p_user_id uuid,p_id uuid,p_revision integer,p_kind text,p_override jsonb default null)
returns jsonb language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare r public.telegram_quick_reminders; s_id uuid; rule jsonb; local_due timestamp; n integer; other public.telegram_quick_reminders;
begin
  -- Series-first locking avoids deadlocks when two different occurrence cards
  -- change the same schedule. The worker uses SKIP LOCKED for occurrence claims.
  select series_id into s_id from public.telegram_quick_reminders where id=p_id and user_id=p_user_id;
  if s_id is not null then perform 1 from public.telegram_reminder_series where id=s_id and user_id=p_user_id for update; end if;
  select * into r from public.telegram_quick_reminders where id=p_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if r.revision<>p_revision then return jsonb_build_object('ok',false,'reason','stale','reminder',to_jsonb(r)); end if;
  if r.status='sending' then return jsonb_build_object('ok',false,'reason','busy','reminder',to_jsonb(r)); end if;
  if r.status in ('draft','done','cancelled') then return jsonb_build_object('ok',false,'reason','finished','reminder',to_jsonb(r)); end if;
  if p_kind is null or p_kind not in ('none','daily','weekdays','weekly','monthly') then raise exception 'Invalid repeat kind'; end if;
  if s_id is not null then
    for other in select * from public.telegram_quick_reminders where series_id=s_id order by id for update loop
      if other.status='sending' then return jsonb_build_object('ok',false,'reason','busy','reminder',to_jsonb(r)); end if;
    end loop;
  end if;
  local_due:=r.due_at at time zone r.timezone;
  if p_kind<>'none' then
    rule:=jsonb_build_object('kind',p_kind,'hour',extract(hour from local_due)::integer,'minute',extract(minute from local_due)::integer,'weekday',extract(isodow from local_due)::integer,'monthday',extract(day from local_due)::integer);
    if p_override is not null then
      if p_kind='weekly' and p_override ? 'weekday' then rule:=jsonb_set(rule,'{weekday}',p_override->'weekday'); end if;
      if p_kind='monthly' and p_override ? 'monthday' then rule:=jsonb_set(rule,'{monthday}',p_override->'monthday'); end if;
    end if;
    if (rule->>'weekday')::integer not between 1 and 7 or (rule->>'monthday')::integer not between 1 and 31 then raise exception 'Invalid repeat day'; end if;
  end if;
  if s_id is null and p_kind<>'none' then
    insert into public.telegram_reminder_series(user_id,chat_id,timezone,title,raw_text,rule,anchor_date,anchor_reminder_id)
      values(r.user_id,r.chat_id,r.timezone,r.title,r.raw_text,rule,local_due::date,r.id) returning id into s_id;
  elsif s_id is not null then
    update public.telegram_reminder_series set active=(p_kind<>'none'),rule=coalesce(rule,public.telegram_reminder_series.rule),anchor_date=local_due::date,anchor_reminder_id=r.id,title=r.title,materialized_until=null where id=s_id;
    -- Retire un-fired future slots, preserving user-skipped occurrences. Only
    -- retired slots may be reactivated if a later rule uses the same time.
    update public.telegram_quick_reminders set status='cancelled',repeat_retired=true,undo_snapshot=null,undo_until=null,
      repeat_rule=rule,revision=revision+1,updated_at=now()
      where series_id=s_id and id<>r.id and due_at>clock_timestamp() and status in ('scheduled','failed','uncertain');
    update public.telegram_quick_reminders set repeat_rule=rule,revision=revision+1,updated_at=now()
      where series_id=s_id and id<>r.id and repeat_rule is distinct from rule;
  end if;
  update public.telegram_quick_reminders set series_id=s_id,repeat_rule=rule,occurrence_at=coalesce(occurrence_at,date_trunc('minute',r.due_at)),revision=revision+1,undo_snapshot=null,undo_until=null,updated_at=now()
    where id=r.id returning * into r;
  if p_kind<>'none' then n:=public.materialize_telegram_reminder_series(s_id); end if;
  return jsonb_build_object('ok',true,'reminder',to_jsonb(r));
end $$;
revoke all on function public.set_telegram_reminder_repeat(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_telegram_reminder_repeat(uuid,uuid,integer,text,jsonb) to service_role;

-- Keep the existing entry point/signature so current bot and calendar clients work.
alter function public.change_telegram_quick_reminder(uuid,uuid,integer,text,timestamptz) rename to change_telegram_quick_reminder_base;
revoke all on function public.change_telegram_quick_reminder_base(uuid,uuid,integer,text,timestamptz) from public,anon,authenticated,service_role;
create function public.change_telegram_quick_reminder(p_user_id uuid,p_id uuid,p_revision integer,p_action text,p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.telegram_quick_reminders; result jsonb; snapshot jsonb;
begin
  select * into r from public.telegram_quick_reminders where id=p_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if r.revision<>p_revision then return jsonb_build_object('ok',false,'reason','stale','reminder',to_jsonb(r)); end if;
  if p_action='undo' then
    if r.status not in ('done','cancelled') or r.undo_until is null or r.undo_until<=clock_timestamp() or r.undo_snapshot is null then return jsonb_build_object('ok',false,'reason','undo_expired','reminder',to_jsonb(r)); end if;
    snapshot:=r.undo_snapshot;
    update public.telegram_quick_reminders set status=snapshot->>'status',due_at=(snapshot->>'due_at')::timestamptz,
      attempts=(snapshot->>'attempts')::smallint,next_attempt_at=(snapshot->>'next_attempt_at')::timestamptz,delivered_at=(snapshot->>'delivered_at')::timestamptz,
      telegram_message_id=(snapshot->>'telegram_message_id')::bigint,revision=revision+1,repeat_retired=false,undo_snapshot=null,undo_until=null,updated_at=now()
      where id=r.id returning * into r;
    return jsonb_build_object('ok',true,'reminder',to_jsonb(r));
  end if;
  result:=public.change_telegram_quick_reminder_base(p_user_id,p_id,p_revision,p_action,p_due_at);
  if not (result->>'ok')::boolean then return result; end if;
  if p_action in ('done','cancel') then
    snapshot:=jsonb_build_object('status',r.status,'due_at',r.due_at,'attempts',r.attempts,'next_attempt_at',r.next_attempt_at,'delivered_at',r.delivered_at,'telegram_message_id',r.telegram_message_id);
    update public.telegram_quick_reminders set undo_snapshot=snapshot,undo_until=clock_timestamp()+interval '10 minutes',repeat_retired=false where id=r.id returning * into r;
  else
    update public.telegram_quick_reminders set undo_snapshot=null,undo_until=null,repeat_retired=false where id=r.id returning * into r;
    if (result->'reminder'->>'status')='scheduled' and r.proposed_repeat is not null and r.series_id is null then
      result:=public.set_telegram_reminder_repeat(p_user_id,r.id,r.revision,r.proposed_repeat->>'kind',r.proposed_repeat);
      if not (result->>'ok')::boolean then raise exception 'Repeat setup failed'; end if;
      return result;
    end if;
  end if;
  return jsonb_build_object('ok',true,'reminder',to_jsonb(r));
end $$;
revoke all on function public.change_telegram_quick_reminder(uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.change_telegram_quick_reminder(uuid,uuid,integer,text,timestamptz) to service_role;

create function public.refresh_telegram_reminder_series(p_user_id uuid,p_now timestamptz default now())
returns integer language plpgsql set search_path = '' as $$
declare s public.telegram_reminder_series; n integer:=0;
begin
  for s in select * from public.telegram_reminder_series where user_id=p_user_id and active and (materialized_until is null or materialized_until<(p_now at time zone timezone)::date+395) order by id for update skip locked loop
    n:=n+public.materialize_telegram_reminder_series(s.id,p_now);
  end loop;
  return n;
end $$;
revoke all on function public.refresh_telegram_reminder_series(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_telegram_reminder_series(uuid,timestamptz) to service_role;

create function public.list_telegram_quick_reminders(p_user_id uuid,p_chat_id bigint)
returns setof public.telegram_quick_reminders language sql stable set search_path = '' as $$
 select r.* from (
   select distinct on(coalesce(series_id,id)) * from public.telegram_quick_reminders
   where user_id=p_user_id and chat_id=p_chat_id and (status not in ('done','cancelled') or undo_until>now())
   order by coalesce(series_id,id),case when undo_until>now() then 0 else 1 end,abs(extract(epoch from (coalesce(due_at,created_at)-now())))
 )r order by updated_at desc limit 10;
$$;
revoke all on function public.list_telegram_quick_reminders(uuid,bigint) from public,anon,authenticated;
grant execute on function public.list_telegram_quick_reminders(uuid,bigint) to service_role;

create or replace function public.update_calendar_quick_reminder(p_id uuid,p_revision integer,p_action text,p_title text default null,p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); r public.telegram_quick_reminders; result jsonb;
begin
  if u is null then raise exception 'Authentication required'; end if;
  select * into r from public.telegram_quick_reminders where id=p_id and user_id=u for update;
  if not found or r.status='draft' then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if r.revision<>p_revision then return jsonb_build_object('ok',false,'reason','stale'); end if;
  if r.status='sending' then return jsonb_build_object('ok',false,'reason','busy'); end if;
  if r.status in ('done','cancelled') and p_action<>'undo' then return jsonb_build_object('ok',false,'reason','finished'); end if;
  if p_action in ('done','cancel','undo') then
    result:=public.change_telegram_quick_reminder(u,r.id,p_revision,p_action);
  elsif p_action='update' then
    if nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>500 then return jsonb_build_object('ok',false,'reason','invalid_title'); end if;
    if p_due_at is null or not isfinite(p_due_at) then return jsonb_build_object('ok',false,'reason','invalid_time'); end if;
    if p_due_at is distinct from r.due_at then
      result:=public.change_telegram_quick_reminder(u,r.id,p_revision,'schedule',p_due_at);
      if not (result->>'ok')::boolean then return jsonb_build_object('ok',false,'reason',result->>'reason'); end if;
      -- Revision has already advanced. Update title in the same transaction.
      update public.telegram_quick_reminders set title=btrim(p_title) where id=r.id;
    else
      -- A title edit alone must never reset delivery or send again.
      update public.telegram_quick_reminders set title=btrim(p_title),revision=revision+1,updated_at=now() where id=r.id;
    end if;
    result:=jsonb_build_object('ok',true);
  else raise exception 'Invalid action'; end if;
  -- Never return chat IDs, Telegram IDs, raw worker state or other bot metadata.
  return jsonb_build_object('ok',coalesce((result->>'ok')::boolean,false),'reason',result->>'reason','revision',(select revision from public.telegram_quick_reminders where id=r.id),'undo_until',(select undo_until from public.telegram_quick_reminders where id=r.id));
end $$;

drop function public.calendar_quick_reminders(timestamptz,timestamptz);
create function public.calendar_quick_reminders(p_from timestamptz,p_to timestamptz)
returns table(id uuid,title text,description text,due_at timestamptz,revision integer,status text,repeat_rule jsonb)
language sql stable security definer set search_path = '' as $$
  select r.id,r.title,r.raw_text,r.due_at,r.revision,r.status,r.repeat_rule
  from public.telegram_quick_reminders r
  where r.user_id=(select auth.uid()) and r.due_at>=p_from and r.due_at<p_to and p_to>p_from and p_to-p_from<=interval '400 days'
    and r.status in ('scheduled','sending','sent','failed','uncertain') order by r.due_at limit 2000;
$$;
revoke all on function public.calendar_quick_reminders(timestamptz,timestamptz) from public,anon;
grant execute on function public.calendar_quick_reminders(timestamptz,timestamptz) to authenticated;
