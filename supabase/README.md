# Supabase setup

## What is already in the repository

`migrations/202609250001_planner_foundation.sql` creates the planner foundation:

- Supabase Auth profile and six default categories;
- tasks, attachments and recurrence metadata;
- calendar events, students and lesson notes;
- Telegram/Yandex Mail inbox queue and notification log;
- a private Storage bucket for task attachments;
- Row Level Security policies for every user-owned table.

## Apply it once

1. Create a new Supabase project in the EU region.
2. Open **SQL Editor** and run the migration file in full.
3. In **Authentication → Providers**, enable email magic links. Do not enable public sign-ups after the first account is created.
4. Copy the project URL and the anon key from **Project Settings → API**.
5. Create `apps/web/.env.local` from `apps/web/.env.example` and fill in:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

Never add a Supabase service-role key to a Vite `VITE_*` variable. That key will be used only by future server-side Telegram, mail and cron workers.
