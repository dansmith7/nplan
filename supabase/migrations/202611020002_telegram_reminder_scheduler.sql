-- The job itself is enabled only after its protected worker and Vault key exist.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.invoke_telegram_event_reminders()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  request_id bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'nplan_telegram_reminder_secret';
  if secret is null then raise exception 'Telegram reminder worker secret is not configured'; end if;
  select net.http_post(
    url := 'https://wfkrnblgnlzhakcmvktn.supabase.co/functions/v1/telegram-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret',secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.invoke_telegram_event_reminders() from public, anon, authenticated, service_role;
