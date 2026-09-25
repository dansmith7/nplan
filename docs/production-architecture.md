# Nplan: production architecture

## Current source of truth

| Area                   | Current state                             | Production source                           |
| ---------------------- | ----------------------------------------- | ------------------------------------------- |
| Authentication         | Supabase Auth                             | Supabase Auth                               |
| Profile and categories | Supabase                                  | `profiles`, `categories`                    |
| Tasks                  | Supabase                                  | `tasks`, `task_attachments`                 |
| Students               | Supabase CRUD and lesson history          | `students`, `student_schedules`             |
| Calendar               | Supabase-backed shared home/full calendar | `calendar_events`                           |
| Lesson topic/homework  | Saved from the student profile            | `lesson_notes`                              |
| Lesson attendance      | Not implemented                           | `lesson_notes.status`                       |
| Telegram/mail inbox    | Supabase CRUD and atomic task promotion   | `inbox_items`                               |
| Morning/evening review | Real clock, live task and inbox queries   | Database queries using profile timezone     |
| Notifications          | Not connected                             | `notification_log` + server/desktop workers |

## Domain model

`students` owns the student identity. A `student_schedule` describes the weekly
rule. Each actual lesson is a distinct `calendar_event`; its topic, homework and
attendance live in the one-to-one `lesson_notes` row.

This separation is intentional:

- moving one lesson never mutates the weekly rule;
- cancelling one occurrence does not destroy the series;
- lesson history is a query over held occurrences, not copied UI data;
- deleting a student deletes their schedules and lessons consistently;
- the calendar, morning review and student profile read the same event.

## Lesson lifecycle

1. A weekly schedule creates concrete upcoming lesson events.
2. The calendar shows `scheduled` lessons.
3. After the scheduled end, the morning review asks whether the lesson happened.
4. `held` keeps the event in student history and exposes topic/homework editing.
5. `cancelled` removes it from active calendar queries while preserving an audit trail.

## Remaining hardcoded UI to remove

- student schedule editing and recurrence expansion UI;
- task attachment controls that are still presentation-only;

## Server boundaries

- Browser: authenticated CRUD through Supabase RLS.
- Vercel Functions: password login and future lightweight callbacks.
- Supabase Edge Functions / scheduled jobs: Telegram webhook, Yandex Mail sync,
  recurrence expansion and morning/evening review preparation.
- Tauri: autostart and native macOS notifications; no service-role secrets.
