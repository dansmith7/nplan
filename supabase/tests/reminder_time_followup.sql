begin;
do $$
declare u uuid:=(select id from public.profiles order by id limit 1); other_user uuid:=(select id from public.profiles order by id offset 1 limit 1); source_id uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); j jsonb; due timestamptz:=now()+interval '2 hours';
begin
 insert into public.inbox_items(id,user_id,source,external_id,title,raw_text) values(source_id,u,'telegram',source_id::text,'time followup transaction fixture','взять с собой еду');
 insert into public.telegram_quick_reminders(id,user_id,inbox_id,chat_id,title,raw_text,timezone)
 values(rid,u,source_id,123456,'взять с собой еду','взять с собой еду','Europe/Istanbul');
 insert into public.telegram_reminder_inputs(user_id,chat_id,prompt_message_id,reminder_id,revision,accept_unthreaded,expires_at)
 values(u,123456,123451,rid,0,true,now()+interval '15 minutes');
 j:=public.apply_telegram_reminder_time_reply(u,123455,123452,123451,0,due);
 assert j->>'reason'='stale','wrong chat cannot consume another chat context';
 j:=public.apply_telegram_reminder_time_reply(other_user,123456,123452,123451,0,due);
 assert j->>'reason'='stale','wrong owner cannot consume context';
 j:=public.apply_telegram_reminder_time_reply(u,123456,123452,123451,0,now()-interval '1 minute');
 assert j->>'reason'='invalid_time','past time rejected';
 assert (select status='new' from public.inbox_items where id=source_id),'invalid time does not promote source';
 assert not exists(select 1 from public.telegram_reminder_time_replies where reminder_id=rid),'invalid time creates no successful receipt';
 j:=public.apply_telegram_reminder_time_reply(u,123456,123452,123451,0,due);
 assert (j->>'ok')::boolean,'bare time schedules original reminder';
 assert (select status='scheduled' and due_at=due and title='взять с собой еду' and revision=1 from public.telegram_quick_reminders where id=rid),'original title and identity preserved';
 assert (select status='promoted' from public.inbox_items where id=source_id),'inbox converted exactly once';
 assert (select not accept_unthreaded from public.telegram_reminder_inputs where user_id=u and chat_id=123456 and prompt_message_id=123451),'picker no longer captures messages';
 assert (select count(*)=1 from public.telegram_reminder_time_replies where reminder_id=rid),'receipt persisted with scheduling';
 j:=public.apply_telegram_reminder_time_reply(u,123456,123452,123451,0,due+interval '1 hour');
 assert (j->>'duplicate')::boolean,'duplicate Telegram message consumed without reapplying';
 assert (select revision=1 and due_at=due from public.telegram_quick_reminders where id=rid),'duplicate did not move reminder';
 j:=public.apply_telegram_reminder_time_reply(u,123456,123453,123451,0,due+interval '1 hour');
 assert j->>'reason'='stale','old prompt cannot override a newer revision';
 update public.telegram_reminder_inputs set revision=1,expires_at=now()-interval '1 minute' where user_id=u and chat_id=123456 and prompt_message_id=123451;
 j:=public.apply_telegram_reminder_time_reply(u,123456,123454,123451,1,due+interval '1 hour');
 assert j->>'reason'='stale','expired explicit reply rejected';
 assert not has_table_privilege('authenticated','public.telegram_reminder_time_replies','select'),'message receipts private';
 assert not has_function_privilege('authenticated','public.apply_telegram_reminder_time_reply(uuid,bigint,bigint,bigint,integer,timestamptz)','execute'),'mutation service only';
end $$;
rollback;
