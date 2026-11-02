begin;
do $$
declare
  owner_id uuid := (select id from public.profiles order by id limit 1);
  other_id uuid := (select id from public.profiles order by id offset 1 limit 1);
  lease uuid;
  planner_id uuid;
  native_id uuid:=gen_random_uuid();
  t timestamptz:=date_trunc('minute',now())+interval '1 day';
  payload jsonb;
  result jsonb;
  n integer;
begin
  -- Everything below, including connection state and fixtures, rolls back.
  delete from public.google_calendar_sync_state where user_id=owner_id;
  lease:=public.acquire_google_calendar_sync(owner_id);
  assert lease is not null;
  assert public.acquire_google_calendar_sync(owner_id) is null, 'overlapping worker must not acquire lease';
  payload:=jsonb_build_array(jsonb_build_object('source_id','google-test','google_id','google-test','organizer_email','aseeva.alisa97@gmail.com',
    'title','Google sync transaction test','description','test','starts_at',t,'ends_at',t+interval '1 hour'));
  result:=public.apply_google_calendar_snapshot(owner_id,lease,now()-interval '7 days',now()+interval '180 days',payload);
  assert (result->>'inserted')::int=1;
  select event_id into planner_id from public.google_calendar_event_links where user_id=owner_id and source_id='google-test';
  insert into public.calendar_events(id,user_id,kind,title,starts_at,ends_at) values(native_id,owner_id,'meeting','native test',t,t+interval '1 hour');

  -- Google moves the same event: update, preserve NPlan identity, no duplicate.
  update public.google_calendar_sync_state set last_success_at=null where user_id=owner_id;
  lease:=public.acquire_google_calendar_sync(owner_id);
  payload:=jsonb_set(jsonb_set(payload,'{0,starts_at}',to_jsonb(t+interval '2 hours')),'{0,ends_at}',to_jsonb(t+interval '3 hours'));
  result:=public.apply_google_calendar_snapshot(owner_id,lease,now()-interval '7 days',now()+interval '180 days',payload);
  assert (result->>'updated')::int=1 and (result->>'inserted')::int=0;
  assert (select starts_at from public.calendar_events where id=planner_id)=t+interval '2 hours';
  assert (select event_id from public.google_calendar_event_links where user_id=owner_id and source_id='google-test')=planner_id;

  -- Old/consumed leases cannot replace a newer snapshot.
  begin
    perform public.apply_google_calendar_snapshot(owner_id,lease,now()-interval '7 days',now()+interval '180 days','[]');
    raise exception 'Consumed lease unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm='Consumed lease unexpectedly accepted' then raise; end if;
  end;
  assert exists(select 1 from public.calendar_events where id=planner_id);

  -- Cancellation/decline/filter change removes only imported events, not native ones.
  update public.google_calendar_sync_state set last_success_at=null where user_id=owner_id;
  lease:=public.acquire_google_calendar_sync(owner_id);
  result:=public.apply_google_calendar_snapshot(owner_id,lease,now()-interval '7 days',now()+interval '180 days','[]');
  assert (result->>'removed')::int=1;
  assert not exists(select 1 from public.calendar_events where id=planner_id);
  assert exists(select 1 from public.calendar_events where id=native_id);

  -- A restored invitation retains the same NPlan identity.
  update public.google_calendar_sync_state set last_success_at=null where user_id=owner_id;
  lease:=public.acquire_google_calendar_sync(owner_id);
  result:=public.apply_google_calendar_snapshot(owner_id,lease,now()-interval '7 days',now()+interval '180 days',payload);
  assert exists(select 1 from public.calendar_events where id=planner_id);
  select count(*) into n from public.google_calendar_event_links where user_id=other_id and source_id='google-test';
  assert n=0, 'other user must not get imported events';
  -- Imported reminders require a fresh, finished sync; native reminders do not.
  update public.calendar_events set starts_at=date_trunc('minute',now())+interval '60 minutes',
    ends_at=date_trunc('minute',now())+interval '120 minutes' where id in(planner_id,native_id);
  select count(*) into n from public.due_telegram_event_reminders(owner_id) where event_id=planner_id;
  assert n=1, 'fresh Google meeting should remind';
  update public.google_calendar_sync_state set last_success_at=now()-interval '10 minutes' where user_id=owner_id;
  select count(*) into n from public.due_telegram_event_reminders(owner_id) where event_id=planner_id;
  assert n=0, 'stale Google snapshot must not send outdated reminders';
  select count(*) into n from public.due_telegram_event_reminders(owner_id) where event_id=native_id;
  assert n=1, 'native reminder must keep working';
  assert not has_function_privilege('authenticated','public.apply_google_calendar_snapshot(uuid,uuid,timestamptz,timestamptz,jsonb)','execute');
  assert not has_table_privilege('authenticated','public.google_calendar_event_links','select');
end $$;
rollback;
