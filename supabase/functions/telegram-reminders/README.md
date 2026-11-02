# NPlan Telegram event reminders

Server-side reminders for the existing private NPlan bot and owner only. Existing
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` and `PLANNER_USER_EMAIL` function
secrets are reused. No frontend or desktop update is required.

- Meetings and scheduled lessons: 60, 30 and 10 minutes before `starts_at`.
- Times in messages use the owner's `profiles.timezone`.
- Student schedules already materialize individual lesson occurrences in the calendar.
- The worker rechecks each event immediately before sending; cancelled, completed,
  deleted, rescheduled and already-started events are skipped.
- The separate journal keys each reminder by event, start time and offset. Concurrent
  invocations cannot claim the same reminder. Mac notification history is unaffected.
- Fresh reminders have a two-minute catch-up window. Explicit Telegram 429/5xx
  failures may retry up to three attempts within five minutes of the intended time.
  Network timeouts or interrupted workers are marked uncertain and never automatically
  resent, since Telegram cannot guarantee idempotent `sendMessage` delivery.

## Deployment

Apply only migrations `202611020001` and `202611020002` on the linked NPlan project,
not unrelated pending migrations. Deploy `telegram-reminders` with JWT verification
disabled (`--no-verify-jwt --use-api`); the handler requires its own random
`TELEGRAM_REMINDER_SECRET` on `x-reminder-secret`. Store the same value in Supabase
Vault as `nplan_telegram_reminder_secret`. Do not commit or print it.

First POST `{"dry_run":true}` with that header: it validates the owner/profile and
queries due reminders without claiming or sending them. Requests missing the
secret must return 401. Only then enable the dedicated job:

```sql
select cron.schedule(
  'nplan-telegram-event-reminders', '* * * * *',
  'select public.invoke_telegram_event_reminders();'
);
```

The scheduler uses pg_cron, pg_net and Vault, following Supabase's scheduling guide:
https://supabase.com/docs/guides/functions/schedule-functions

## Verification and operations

```sh
bun test supabase/functions/telegram-reminders/core.test.ts
# Typecheck the Edge Function with Deno, outside the monorepo npm workspace.
# Run supabase/tests/telegram_event_reminders.sql with a privileged database role.
```

The SQL test wraps fixtures in a transaction and rolls everything back. It covers
all offsets, duplicates, owner isolation, rescheduling, cancellations, start-time
cutoffs, retry eligibility and service-only RPC/table privileges.

Monitor `cron.job_run_details` plus `net._http_response`: a successful SQL cron
run alone does not prove the HTTP worker succeeded. The HTTP response contains only
counts and status codes, never titles, recipient IDs or credentials. Journal rows
in `failed`, `uncertain` or `skipped` explain failures via safe error codes.

To disable delivery without changing the existing inbox webhook:

```sql
select cron.unschedule('nplan-telegram-event-reminders');
```
