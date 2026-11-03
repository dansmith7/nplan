begin;
do $$
declare u uuid:=(select id from public.profiles order by id limit 1); rid uuid:=gen_random_uuid(); sid uuid; j jsonb; r public.telegram_quick_reminders; n integer; slot uuid; source_id uuid:=gen_random_uuid(); other_user uuid:=(select id from public.profiles order by id offset 1 limit 1); delivery timestamptz:=now()-interval '1 minute';
begin
 insert into public.telegram_quick_reminders(id,user_id,chat_id,title,raw_text,timezone,status,due_at,proposed_repeat)
 values(rid,u,123456,'recurring transaction fixture','fixture','Europe/Istanbul','scheduled',now()+interval '2 hours','{"kind":"daily"}');
 j:=public.set_telegram_reminder_repeat(u,rid,0,'daily');
 assert (j->>'ok')::boolean,'repeat setup'; sid:=(j->'reminder'->>'series_id')::uuid;
 select count(*) into n from public.telegram_quick_reminders where series_id=sid;
 assert n between 400 and 402,'400-day horizon';
 perform public.materialize_telegram_reminder_series(sid);
 assert (select count(*)=n from public.telegram_quick_reminders where series_id=sid),'idempotent materialization';
 assert (select count(*)=1 from public.telegram_quick_reminders where series_id=sid and date_trunc('minute',due_at)=date_trunc('minute',now()+interval '2 hours')),'no root duplicate';
 select * into r from public.telegram_quick_reminders where series_id=sid and id<>rid order by due_at limit 1;slot:=r.id;
 j:=public.change_telegram_quick_reminder(u,slot,r.revision,'cancel');
 assert (j->>'ok')::boolean,'skip one';
 perform public.materialize_telegram_reminder_series(sid);
 assert (select status='cancelled' from public.telegram_quick_reminders where id=slot),'refresh preserves skipped occurrence';
 update public.telegram_quick_reminders set status='sent',attempts=1,delivered_at=delivery,telegram_message_id=999 where id=rid;
 select * into r from public.telegram_quick_reminders where id=rid;
 j:=public.change_telegram_quick_reminder(u,rid,r.revision,'done');
 assert (j->>'ok')::boolean,'complete current occurrence';
 assert exists(select 1 from public.telegram_quick_reminders where series_id=sid and status='scheduled'),'future retained';
 j:=public.change_telegram_quick_reminder(u,rid,r.revision,'undo'); assert j->>'reason'='stale','stale undo rejected';
 j:=public.change_telegram_quick_reminder(u,rid,r.revision+1,'undo');assert (j->>'ok')::boolean,'undo works';
 assert (select status='sent' and attempts=1 and delivered_at=delivery and telegram_message_id=999 from public.telegram_quick_reminders where id=rid),'undo preserves delivery; no resend';
 select * into r from public.telegram_quick_reminders where id=rid;
 j:=public.set_telegram_reminder_repeat(u,rid,r.revision,'none');assert (j->>'ok')::boolean,'disable repeats';
 assert not exists(select 1 from public.telegram_quick_reminders where series_id=sid and id<>rid and status='scheduled'),'future disabled';
 assert (select status='sent' and repeat_rule is null from public.telegram_quick_reminders where id=rid),'current retained';
 select * into r from public.telegram_quick_reminders where id=rid;
 j:=public.change_telegram_quick_reminder(u,rid,r.revision,'done');
 update public.telegram_quick_reminders set undo_until=now()-interval '1 second' where id=rid;
 j:=public.change_telegram_quick_reminder(u,rid,r.revision+1,'undo');assert j->>'reason'='undo_expired','expiry enforced server-side';
 assert public.telegram_repeat_at('{"kind":"monthly","hour":10,"minute":0,"monthday":31}',date '2027-02-28','Europe/Istanbul')='2027-02-28 07:00Z'::timestamptz,'monthly clamped';
 assert public.telegram_repeat_at('{"kind":"weekdays","hour":10,"minute":0}',date '2026-11-07','Europe/Istanbul') is null,'weekend skipped';
 -- Initial proposal promotes the inbox atomically and creates a series once.
 insert into public.inbox_items(id,user_id,source,external_id,title,raw_text) values(source_id,u,'telegram',source_id::text,'auto repeat fixture','fixture');
 rid:=gen_random_uuid();
 insert into public.telegram_quick_reminders(id,user_id,inbox_id,chat_id,title,raw_text,timezone,proposed_repeat)
 values(rid,u,source_id,123456,'auto repeat fixture','fixture','Europe/Istanbul','{"kind":"weekly","weekday":3}');
 j:=public.change_telegram_quick_reminder(u,rid,0,'schedule',now()+interval '2 hours');
 assert (j->>'ok')::boolean and j->'reminder'->>'series_id' is not null,'draft proposal creates series';
 assert (select status='promoted' from public.inbox_items where id=source_id),'inbox converted once';
 select * into r from public.telegram_quick_reminders where id=rid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 j:=public.update_calendar_quick_reminder(rid,r.revision,'cancel');assert (j->>'ok')::boolean and j ? 'undo_until','calendar cancel exposes safe undo result';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
 j:=public.update_calendar_quick_reminder(rid,r.revision+1,'undo');assert j->>'reason'='not_found','cannot undo another owner reminder';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 j:=public.update_calendar_quick_reminder(rid,r.revision+1,'undo');assert (j->>'ok')::boolean,'calendar undo restores';
 assert (select status='scheduled' from public.telegram_quick_reminders where id=rid),'future reminder restored';
 assert not has_table_privilege('authenticated','public.telegram_reminder_series','select'),'series private';
 assert not has_function_privilege('authenticated','public.set_telegram_reminder_repeat(uuid,uuid,integer,text,jsonb)','execute'),'repeat mutation service only';
end $$;
rollback;
