# Personal Google Calendar → NPlan sync

Source calendar: `dankuzn2@gmail.com`. Organizer allowlist: exactly
`aseeva.alisa97@gmail.com`. Google is read-only. NPlan stores only matching,
timed, non-declined events, with title, description, place and meeting links.

Google Apps Script supplies a short-lived Google OAuth token to the protected
`google-calendar-sync` Edge Function once a minute. The function validates the
verified Google account, reads the fixed source calendar through the Google API,
filters events and applies a complete snapshot atomically. OAuth tokens are never
stored or logged. No OAuth client secret or refresh token is needed in NPlan.

## Install

1. Apply only migrations `202611020003` and `202611020004` to the linked NPlan DB.
2. Deploy `supabase/functions/google-calendar-sync` using `--no-verify-jwt --use-api`.
   Platform JWT verification is disabled because this endpoint validates Google
   OAuth bearer tokens itself. Missing/invalid tokens and other Google accounts
   are rejected before any changes.
3. Create an Apps Script project in `dankuzn2@gmail.com`, titled **NPlan Calendar Sync**.
4. Copy `Code.gs` and the explicit `appsscript.json` manifest into the project.
   The manifest enables Calendar API with a default Google Cloud project and asks
   only for reading events on owned calendars, Google email identity, external
   requests, and managing this script's timer.
5. Run `startNPlanSync`, authorize Google permissions, and verify the first run.
   This creates one idempotent minute trigger after a successful initial sync.

Google-owned source calendar window: 7 days back to 180 days ahead. Each successful
full snapshot covers every API page before any database writes. The API expands
recurrences. Moved individual instances use series ID + original occurrence time,
so their NPlan UUID survives a move. One-off events use their Google event ID.
Cancelled, declined, removed, or newly nonmatching events disappear from NPlan
without touching native tasks, lessons or meetings. A restored event retains its
previous NPlan UUID. Historical rows older than the import window remain intact.

A lease prevents overlapping workers or stale snapshots from overwriting newer
results. Google reminders require a finished sync from the last three minutes;
native NPlan reminders work independently. If Google/API authorization fails, the
last successful calendar snapshot remains, and outdated Google reminders stop.

`stopNPlanSync` removes this project's timer. Revoking the Apps Script's Google
access also disconnects it. The importer writes only to NPlan, never to Google.

## Verification

```sh
bun test supabase/functions/google-calendar-sync/core.test.ts supabase/functions/telegram-reminders/core.test.ts
# Deno check the Edge Function outside this monorepo's npm workspace.
# Execute supabase/tests/google_calendar_sync.sql in a transaction (it rolls back).
```

Inspect `public.google_calendar_sync_state` with a privileged role for last success,
safe error code and imported count. Connection state/link mappings have RLS and no
browser/anonymous access. Inspect the Apps Script execution log for safe counts.

References:
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://developers.google.com/apps-script/guides/triggers/installable
- https://developers.google.com/apps-script/guides/services/advanced
