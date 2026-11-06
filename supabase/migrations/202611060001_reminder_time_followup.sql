-- A short chat context accepts a time as the next message after the picker.
-- Existing prompts remain explicit replies until reopened by the user.
alter table public.telegram_reminder_inputs
  add column accept_unthreaded boolean not null default false,
  add column created_at timestamptz not null default now();
create index reminder_inputs_current_chat_idx on public.telegram_reminder_inputs(user_id,chat_id,created_at desc)
  where accept_unthreaded;
create table public.telegram_reminder_time_replies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id bigint not null,
  message_id bigint not null,
  reminder_id uuid references public.telegram_quick_reminders(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id,chat_id,message_id)
);
alter table public.telegram_reminder_time_replies enable row level security;
revoke all on public.telegram_reminder_time_replies from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_reminder_time_replies to service_role;
create function public.apply_telegram_reminder_time_reply(
 p_user_id uuid,p_chat_id bigint,p_message_id bigint,p_prompt_message_id bigint,p_revision integer,p_due_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare prompt public.telegram_reminder_inputs; r public.telegram_quick_reminders; consumed uuid; result jsonb;
begin
 if p_message_id is null or p_message_id<=0 then raise exception 'Invalid message ID';end if;
 -- Serialize retries of the same Telegram update; scheduling and its receipt
 -- commit together, so a redelivery cannot become a new standalone inbox item.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_chat_id::text||':'||p_message_id::text,0));
 select reminder_id into consumed from public.telegram_reminder_time_replies
   where user_id=p_user_id and chat_id=p_chat_id and message_id=p_message_id;
 if found then return jsonb_build_object('ok',true,'duplicate',true);end if;
 select * into prompt from public.telegram_reminder_inputs
   where user_id=p_user_id and chat_id=p_chat_id and prompt_message_id=p_prompt_message_id for update;
 if not found or prompt.expires_at<=clock_timestamp() or prompt.revision<>p_revision then
   return jsonb_build_object('ok',false,'reason','stale');
 end if;
 select * into r from public.telegram_quick_reminders where id=prompt.reminder_id and user_id=p_user_id and chat_id=p_chat_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 result:=public.change_telegram_quick_reminder(p_user_id,r.id,p_revision,'schedule',p_due_at);
 if (result->>'ok')::boolean then
   insert into public.telegram_reminder_time_replies(user_id,chat_id,message_id,reminder_id) values(p_user_id,p_chat_id,p_message_id,r.id);
   update public.telegram_reminder_inputs set accept_unthreaded=false
     where user_id=p_user_id and chat_id=p_chat_id and created_at<=prompt.created_at;
 end if;
 return result;
end $$;
revoke all on function public.apply_telegram_reminder_time_reply(uuid,bigint,bigint,bigint,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_telegram_reminder_time_reply(uuid,bigint,bigint,bigint,integer,timestamptz) to service_role;
