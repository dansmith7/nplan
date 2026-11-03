-- Calendar reads a projection of the same bot rows, never copies into calendar_events.
create index quick_reminders_calendar_idx on public.telegram_quick_reminders(user_id,due_at)
  where status in ('scheduled','sending','sent','failed','uncertain');
create function public.calendar_quick_reminders(p_from timestamptz, p_to timestamptz)
returns table(id uuid,title text,description text,due_at timestamptz,revision integer,status text)
language sql stable security definer set search_path = '' as $$
  select r.id,r.title,r.raw_text,r.due_at,r.revision,r.status
  from public.telegram_quick_reminders r
  where r.user_id=(select auth.uid()) and r.due_at>=p_from and r.due_at<p_to
    and p_to>p_from and p_to-p_from<=interval '400 days'
    and r.status in ('scheduled','sending','sent','failed','uncertain')
  order by r.due_at limit 2000;
$$;
revoke all on function public.calendar_quick_reminders(timestamptz,timestamptz) from public,anon;
grant execute on function public.calendar_quick_reminders(timestamptz,timestamptz) to authenticated;

create function public.update_calendar_quick_reminder(p_id uuid,p_revision integer,p_action text,p_title text default null,p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); r public.telegram_quick_reminders; result jsonb;
begin
  if u is null then raise exception 'Authentication required'; end if;
  select * into r from public.telegram_quick_reminders where id=p_id and user_id=u for update;
  if not found or r.status='draft' then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if r.revision<>p_revision then return jsonb_build_object('ok',false,'reason','stale'); end if;
  if r.status='sending' then return jsonb_build_object('ok',false,'reason','busy'); end if;
  if r.status in ('done','cancelled') then return jsonb_build_object('ok',false,'reason','finished'); end if;
  if p_action in ('done','cancel') then
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
  return jsonb_build_object('ok',coalesce((result->>'ok')::boolean,false),'reason',result->>'reason');
end $$;
revoke all on function public.update_calendar_quick_reminder(uuid,integer,text,text,timestamptz) from public,anon;
grant execute on function public.update_calendar_quick_reminder(uuid,integer,text,text,timestamptz) to authenticated;

-- Queue edits of existing bot cards. No extra notification is sent for a calendar change.
create table public.telegram_reminder_card_updates (
  reminder_id uuid not null references public.telegram_quick_reminders(id) on delete cascade,
  message_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  revision integer not null,
  attempts smallint not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  primary key(reminder_id,message_id)
);
create index reminder_card_updates_due_idx on public.telegram_reminder_card_updates(user_id,next_attempt_at);
alter table public.telegram_reminder_card_updates enable row level security;
revoke all on public.telegram_reminder_card_updates from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_reminder_card_updates to service_role;
create function public.queue_telegram_reminder_card_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revision is distinct from old.revision then
    insert into public.telegram_reminder_card_updates(reminder_id,message_id,user_id,revision)
      select new.id,m,new.user_id,new.revision from
        (select old.offer_message_id as m union select old.telegram_message_id) ids where m is not null
    on conflict(reminder_id,message_id) do update set revision=excluded.revision,attempts=0,next_attempt_at=now();
  end if;
  return new;
end $$;
revoke all on function public.queue_telegram_reminder_card_update() from public,anon,authenticated,service_role;
create trigger quick_reminder_card_update after update on public.telegram_quick_reminders
  for each row execute function public.queue_telegram_reminder_card_update();

create function public.claim_telegram_reminder_card_updates(p_user_id uuid,p_now timestamptz default now())
returns setof public.telegram_reminder_card_updates language sql volatile set search_path = '' as $$
  with candidates as (
    select reminder_id,message_id from public.telegram_reminder_card_updates
    where user_id=p_user_id and attempts<3 and next_attempt_at<=p_now and (lease_until is null or lease_until<=p_now)
    order by next_attempt_at limit 5 for update skip locked
  )
  update public.telegram_reminder_card_updates q set lease_id=gen_random_uuid(),lease_until=p_now+interval '2 minutes',attempts=attempts+1
    from candidates c where q.reminder_id=c.reminder_id and q.message_id=c.message_id returning q.*;
$$;
revoke all on function public.claim_telegram_reminder_card_updates(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_telegram_reminder_card_updates(uuid,timestamptz) to service_role;
