# Personal Telegram quick reminders

Text message → existing NPlan inbox item → inline create button. A parsed date/time
is a proposal only. Nothing is scheduled until the owner presses the button.
Missing, unsupported or invalid times open a small preset menu or a ForceReply
prompt. Full original text stays attached to the source and reminder.

Examples: `Завтра в 19:30 оплатить интернет`, `через час проверить почту`,
`в пятницу в 18:00 позвонить`, `05.11 в 10:30 проверить`, `послезавтра утром`.
Morning is 09:00, afternoon 12:00, evening 20:00. A time without a date means its
next occurrence. An explicit past date/time is rejected. A date without a year
means its next occurrence. The confirmation always prints the exact date, time
and the owner's `profiles.timezone`. Nonexistent/ambiguous DST times are rejected.
Recurring requests are not interpreted as a one-off schedule without choosing a
time. No external AI service or API key is used. Text only in this first version.

The worker delivers ONE notification at/after the selected time (minute cron),
independent of calendar lesson/meeting 60/30/10-minute lead notifications.
Late deliveries are not silently dropped after an outage. A delivered card has
Done, snooze 15/60 minutes, change time, cancel. `/reminders` reopens recent cards.
Custom time replies must target that reminder's ForceReply prompt; ordinary
messages remain independent inbox entries. Reply `отмена` to leave that prompt.

## Integrity and access

- Accept only configured private chat AND the configured user's sender ID.
- Validate callback UUID/action/revision and scope every lookup to owner/chat.
- SQL row locks + expected revision make double taps/stale cards harmless.
- First scheduling atomically promotes the inbox item. The lock is shared with
  task promotion, so it cannot turn into both a task and a reminder.
- SKIP LOCKED claims prevent overlapping workers sending the same revision.
- Recheck claim before delivery; mutations report busy during the short send.
- Explicit Telegram rate limits/5xx retry at most three times. Unknown delivery
  (timeout, interrupted worker, lost response) never blindly retries.
- Inbox response claims also prevent duplicate offers after webhook redelivery.
  An ambiguous offer can be recovered through `/reminders`.
- Tables and RPCs are service-only, RLS enabled, no browser/anonymous grants.
- No credentials, recipient IDs, message texts or Telegram URLs in logs.

## Deployment

1. Apply ONLY `202611030001_telegram_quick_reminders.sql`; leave unrelated pending
   `202610200001_collection_groups.sql` alone.
2. Deploy `telegram-quick-reminders` and `telegram-webhook` with
   `--no-verify-jwt --use-api`. Handlers validate existing webhook/worker secrets.
   Existing environment secrets are reused; none need to be printed or changed.
3. Invoke the quick worker once with `{ "configure_webhook": true }` using the
   existing Vault worker secret. It verifies the existing webhook URL before
   enabling `message` + `callback_query`; pending updates are preserved.
4. Check dry run `{ "dry_run": true }`, no/invalid-secret 401 responses, then
   enable `cron.schedule('nplan-telegram-quick-reminders','* * * * *',
   'select public.invoke_telegram_quick_reminders();')` from a privileged DB role.
5. Verify real message → button → scheduled row/inbox promotion → automatic
   delivery → Done, plus a time-free message and custom time reply.

The bot feature runs independently of frontend/desktop releases. The web calendar
also reads an authenticated projection of active reminder rows through
`calendar_quick_reminders`. Browser changes use `update_calendar_quick_reminder`
with an expected revision; chat IDs and worker metadata are not exposed. Done and
cancelled rows leave the calendar. No duplicate `calendar_events` rows are created,
so calendar lead notifications never fire for these reminders.

Existing Telegram cards are updated by the minute worker through a private,
leased outbox after a revision changes, including changes made in the calendar.
It edits existing messages only. Failed edits retry up to three times; a stale
card action always reopens current state. The visible web calendar refreshes every
15 seconds. Installed Mac builds need the updated frontend to display this view.

## Checks

- `bun test supabase/functions/_shared/quick-reminders.test.ts supabase/functions/telegram-webhook/quick.test.ts supabase/functions/telegram-reminders/core.test.ts supabase/functions/google-calendar-sync/core.test.ts`
- Deno check webhook/quick worker outside the Bun monorepo.
- `supabase/tests/telegram_quick_reminders.sql`: transactional fixtures roll back.
- Existing Google sync and calendar notification cron health remain independent.

Telegram API: https://core.telegram.org/bots/api#inlinekeyboardmarkup
https://core.telegram.org/bots/api#callbackquery
https://core.telegram.org/bots/api#forcereply
