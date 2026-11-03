-- Personal one-shot reminders, deliberately separate from calendar lead notifications.
create table public.telegram_quick_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inbox_id uuid not null unique references public.inbox_items(id) on delete cascade,
  chat_id bigint not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  raw_text text not null,
  timezone text not null,
  proposed_at timestamptz,
  due_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed','uncertain','done','cancelled')),
  revision integer not null default 0 check (revision >= 0),
  attempts smallint not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  telegram_message_id bigint,
  error_code text,
  offer_state text not null default 'pending' check (offer_state in ('pending','sending','sent','uncertain')),
  offer_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft','done','cancelled') or due_at is not null)
);
create index quick_reminders_due_idx on public.telegram_quick_reminders(user_id, chat_id, due_at)
  where status in ('scheduled','failed');
create index quick_reminders_active_idx on public.telegram_quick_reminders(user_id, created_at desc)
  where status not in ('done','cancelled');
alter table public.telegram_quick_reminders enable row level security;
revoke all on public.telegram_quick_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_quick_reminders to service_role;

create table public.telegram_reminder_inputs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id bigint not null,
  prompt_message_id bigint not null,
  reminder_id uuid not null references public.telegram_quick_reminders(id) on delete cascade,
  revision integer not null,
  expires_at timestamptz not null default now() + interval '1 day',
  primary key (user_id, chat_id, prompt_message_id)
);
create index reminder_inputs_reminder_idx on public.telegram_reminder_inputs(reminder_id);
alter table public.telegram_reminder_inputs enable row level security;
revoke all on public.telegram_reminder_inputs from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_reminder_inputs to service_role;

create function public.change_telegram_quick_reminder(p_user_id uuid, p_id uuid, p_revision integer, p_action text, p_due_at timestamptz default null)
returns jsonb language plpgsql set search_path = '' as $$
declare r public.telegram_quick_reminders; source_status public.inbox_status;
begin
  select * into r from public.telegram_quick_reminders where id=p_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if r.revision <> p_revision then return jsonb_build_object('ok',false,'reason','stale','reminder',to_jsonb(r)); end if;
  if r.status='sending' then return jsonb_build_object('ok',false,'reason','busy','reminder',to_jsonb(r)); end if;
  if r.status in ('done','cancelled') then return jsonb_build_object('ok',false,'reason','finished','reminder',to_jsonb(r)); end if;
  if p_action not in ('schedule','done','cancel') or p_action is null then raise exception 'Invalid action'; end if;
  if p_action='schedule' then
    if p_due_at is null or not isfinite(p_due_at) or p_due_at <= clock_timestamp() or p_due_at > clock_timestamp()+interval '2 years' then
      return jsonb_build_object('ok',false,'reason','invalid_time','reminder',to_jsonb(r));
    end if;
    if r.status='draft' then
      select status into source_status from public.inbox_items where id=r.inbox_id and user_id=p_user_id for update;
      if not found or source_status <> 'new' then return jsonb_build_object('ok',false,'reason','source_processed','reminder',to_jsonb(r)); end if;
      -- Same lock used by task promotion. A task/reminder conversion cannot win twice.
      update public.inbox_items set status='promoted', metadata=metadata||jsonb_build_object('quick_reminder_id',r.id)
        where id=r.inbox_id and user_id=p_user_id;
    end if;
    update public.telegram_quick_reminders set status='scheduled', due_at=p_due_at, revision=revision+1,
      attempts=0, claimed_at=null, next_attempt_at=null, delivered_at=null, telegram_message_id=null, error_code=null, updated_at=now()
      where id=r.id returning * into r;
  else
    update public.telegram_quick_reminders set status=case when p_action='done' then 'done' else 'cancelled' end,
      revision=revision+1, next_attempt_at=null, updated_at=now() where id=r.id returning * into r;
  end if;
  return jsonb_build_object('ok',true,'reminder',to_jsonb(r));
end $$;

create function public.claim_telegram_quick_reminders(p_user_id uuid, p_chat_id bigint, p_now timestamptz default now())
returns setof public.telegram_quick_reminders language sql volatile set search_path = '' as $$
  with candidates as (
    select id from public.telegram_quick_reminders
    where user_id=p_user_id and chat_id=p_chat_id and due_at<=p_now
      and (status='scheduled' or (status='failed' and attempts<3 and next_attempt_at<=p_now))
    order by due_at limit 10 for update skip locked
  )
  update public.telegram_quick_reminders r set status='sending',attempts=attempts+1,claimed_at=p_now,next_attempt_at=null,updated_at=now()
    from candidates c where r.id=c.id returning r.*;
$$;
revoke all on function public.change_telegram_quick_reminder(uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_telegram_quick_reminders(uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.change_telegram_quick_reminder(uuid,uuid,integer,text,timestamptz) to service_role;
grant execute on function public.claim_telegram_quick_reminders(uuid,bigint,timestamptz) to service_role;

-- Enabled only after deployment/verification. Reuses the existing private Vault secret.
create function public.invoke_telegram_quick_reminders()
returns bigint language plpgsql security definer set search_path = '' as $$
declare secret text; request_id bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='nplan_telegram_reminder_secret';
  if secret is null then raise exception 'Telegram reminder worker secret is not configured'; end if;
  select net.http_post(
    url:='https://wfkrnblgnlzhakcmvktn.supabase.co/functions/v1/telegram-quick-reminders',
    headers:=jsonb_build_object('Content-Type','application/json','x-reminder-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.invoke_telegram_quick_reminders() from public,anon,authenticated,service_role;
