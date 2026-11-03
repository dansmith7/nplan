begin;
do $$
declare u uuid:=(select id from public.profiles order by id limit 1); lease uuid; pid uuid; t timestamptz:=date_trunc('minute',now())+interval '2 days'; payload jsonb; j jsonb; alert uuid; n integer;
begin
 delete from public.google_calendar_sync_state where user_id=u;
 lease:=public.acquire_google_calendar_sync(u);
 payload:=jsonb_build_array(jsonb_build_object('source_id','change-alert-test','google_id','change-alert-test','organizer_email','aseeva.alisa97@gmail.com','title','Change alert transaction fixture','description','test','starts_at',t,'ends_at',t+interval '1 hour'));
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 select event_id into pid from public.google_calendar_event_links where user_id=u and source_id='change-alert-test';
 assert not exists(select 1 from public.telegram_calendar_changes where user_id=u and source_id='change-alert-test'),'first import is silent';
 -- Local edit is overwritten from Google, but is not attributed to the organizer.
 update public.calendar_events set starts_at=t+interval '1 hour',ends_at=t+interval '2 hours' where id=pid;
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 assert not exists(select 1 from public.telegram_calendar_changes where user_id=u and source_id='change-alert-test'),'local edit and duplicate snapshot are silent';
 payload:=jsonb_set(jsonb_set(payload,'{0,starts_at}',to_jsonb(t+interval '3 hours')),'{0,ends_at}',to_jsonb(t+interval '4 hours'));
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 assert (select count(*)=1 from public.telegram_calendar_changes where source_id='change-alert-test' and user_id=u and kind='moved' and before_start=t and after_start=t+interval '3 hours'),'Google move queued with both timestamps';
 -- Another change supersedes an unsent notification.
 payload:=jsonb_set(jsonb_set(payload,'{0,starts_at}',to_jsonb(t+interval '4 hours')),'{0,ends_at}',to_jsonb(t+interval '5 hours'));
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 select id into alert from public.claim_telegram_calendar_changes(u) where source_id='change-alert-test';
 assert alert is not null,'latest move can be claimed';
 assert (select count(*)=1 from public.telegram_calendar_changes where source_id='change-alert-test' and user_id=u and status='skipped'),'old pending move suppressed';
 assert not exists(select 1 from public.claim_telegram_calendar_changes(u) where source_id='change-alert-test'),'overlapping worker cannot claim same change';
 assert exists(select 1 from public.current_telegram_calendar_change(u,alert)),'latest committed version can send';
 update public.google_calendar_sync_state set last_success_at=now()-interval '10 minutes' where user_id=u;
 assert not exists(select 1 from public.current_telegram_calendar_change(u,alert)),'stale snapshot cannot send';
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 assert not exists(select 1 from public.current_telegram_calendar_change(u,alert)),'in-flight snapshot cannot send';
 -- Confirmed cancellation removes the event and survives without a calendar row.
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days','[{"source_id":"change-alert-test","cancelled":true}]');
 assert not exists(select 1 from public.calendar_events where id=pid),'cancel removes imported event';
 assert not exists(select 1 from public.current_telegram_calendar_change(u,alert)),'move cannot send after cancellation';
 select id into alert from public.claim_telegram_calendar_changes(u) where source_id='change-alert-test' and kind='cancelled';
 assert alert is not null and exists(select 1 from public.current_telegram_calendar_change(u,alert)),'cancel notification retains its own details';
 -- Restoration is silent and invalidates a previously queued cancellation.
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 assert not exists(select 1 from public.current_telegram_calendar_change(u,alert)),'cancel cannot send after restoration';
 assert (select count(*)=3 from public.telegram_calendar_changes where user_id=u and source_id='change-alert-test'),'restoration did not create a new alert';
 -- A known meeting can move beyond the normal import window without cancellation.
 payload:=jsonb_set(jsonb_set(payload,'{0,starts_at}',to_jsonb(t+interval '250 days')),'{0,ends_at}',to_jsonb(t+interval '250 days 1 hour'));
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 assert (select starts_at=t+interval '250 days' from public.calendar_events where id=pid),'known outside-window meeting stays in NPlan';
 -- A successful snapshot without a confirmed tombstone may remove scope changes,
 -- but it must never tell the user those meetings were cancelled.
 payload:=jsonb_set(jsonb_set(payload,'{0,starts_at}',to_jsonb(t)),'{0,ends_at}',to_jsonb(t+interval '1 hour'));
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days',payload);
 select count(*) into n from public.telegram_calendar_changes where user_id=u and source_id='change-alert-test' and kind='cancelled';
 update public.google_calendar_sync_state set last_success_at=null where user_id=u;lease:=public.acquire_google_calendar_sync(u);
 perform public.apply_google_calendar_snapshot(u,lease,now()-interval '7 days',now()+interval '180 days','[]');
 assert (select count(*)=n from public.telegram_calendar_changes where user_id=u and source_id='change-alert-test' and kind='cancelled'),'absence alone is not cancellation';
 assert not has_table_privilege('authenticated','public.telegram_calendar_changes','select'),'notification history private';
 assert not has_function_privilege('authenticated','public.claim_telegram_calendar_changes(uuid)','execute'),'claim service-only';
 assert not exists(select 1 from public.current_telegram_calendar_change(gen_random_uuid(),alert)),'other owner cannot read alert';
end $$;
rollback;
