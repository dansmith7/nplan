-- Run with a privileged database role. All fixtures and claims roll back.
begin;
do $$
#variable_conflict use_variable
declare
  owner_id uuid := (select id from public.profiles order by id limit 1);
  other_id uuid := (select id from public.profiles order by id offset 1 limit 1);
  event_id uuid := gen_random_uuid();
  lesson_id uuid := gen_random_uuid();
  student_id uuid := gen_random_uuid();
  t timestamptz := '2035-01-02 08:00:00+00';
  n integer;
begin
  insert into public.calendar_events(id,user_id,kind,title,starts_at,ends_at)
  values (event_id,owner_id,'meeting','reminder transaction test',t+interval '60 minutes',t+interval '120 minutes');
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t);
  assert n=1, 'hour reminder must be claimed';
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '10 seconds');
  assert n=0, 'duplicate invocation must not claim again';
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '30 minutes');
  assert n=1, 'half-hour reminder must be claimed';
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '50 minutes');
  assert n=1, 'ten-minute reminder must be claimed';
  select count(*) into n from public.telegram_event_reminders r where r.event_id=event_id;
  assert n=3, 'three distinct offsets per event';
  select count(*) into n from public.claim_telegram_event_reminders(other_id,t);
  assert n=0, 'another user must not receive owner reminders';

  -- Moving creates a new occurrence identity; old claimed reminders cannot suppress it.
  update public.calendar_events set starts_at=t+interval '2 hours',ends_at=t+interval '3 hours' where id=event_id;
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '1 hour');
  assert n=1, 'moved event must get new reminders';
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '2 hours');
  assert n=0, 'started events must not notify';

  -- An explicit failed delivery can retry, ambiguous delivery cannot.
  update public.telegram_event_reminders r set status='failed',next_attempt_at=t+interval '1 hour 1 minute'
    where r.event_id=event_id and r.starts_at=t+interval '2 hours';
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '1 hour 1 minute');
  assert n=1, 'explicit failure should retry';
  update public.telegram_event_reminders r set status='uncertain' where r.event_id=event_id;
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t+interval '1 hour 1 minute 10 seconds');
  assert n=0, 'ambiguous result must not retry';

  insert into public.students(id,user_id,name) values(student_id,owner_id,'reminder test student');
  insert into public.calendar_events(id,user_id,student_id,kind,title,starts_at,ends_at)
    values(lesson_id,owner_id,student_id,'lesson','test cancelled lesson',t+interval '1 hour',t+interval '2 hours');
  update public.lesson_notes set status='cancelled',cancelled_at=t where public.lesson_notes.event_id=lesson_id;
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t);
  assert n=0, 'cancelled lesson must not notify';
  update public.lesson_notes set status='scheduled',cancelled_at=null where public.lesson_notes.event_id=lesson_id;
  select count(*) into n from public.claim_telegram_event_reminders(owner_id,t);
  assert n=1, 'scheduled lesson must notify';

  assert not has_function_privilege('authenticated','public.claim_telegram_event_reminders(uuid,timestamptz)','execute'), 'users must not invoke worker RPC';
  assert not has_table_privilege('anon','public.telegram_event_reminders','select'), 'anon cannot read reminder journal';
end $$;
rollback;
