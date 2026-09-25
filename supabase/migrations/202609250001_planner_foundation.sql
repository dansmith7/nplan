-- Personal planner foundation. All user-owned records are protected by RLS.

create type public.task_status as enum ('in_progress', 'completed');
create type public.recurrence_frequency as enum ('none', 'weekly', 'monthly');
create type public.calendar_event_kind as enum ('task', 'lesson', 'meeting');
create type public.inbox_source as enum ('telegram', 'yandex_mail');
create type public.inbox_status as enum ('new', 'dismissed', 'promoted');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Istanbul',
  morning_review_time time not null default '10:15',
  evening_review_time time not null default '17:50',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order smallint not null default 0,
  icon_key text,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, sort_order)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  schedule_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  description text,
  status public.task_status not null default 'in_progress',
  due_date date,
  due_time time,
  recurrence public.recurrence_frequency not null default 'none',
  recurrence_series_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or (status = 'in_progress' and completed_at is null))
);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('file', 'image', 'link')),
  storage_path text,
  external_url text,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  check (
    (kind = 'link' and external_url is not null and storage_path is null)
    or (kind in ('file', 'image') and storage_path is not null and external_url is null)
  )
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id uuid unique references public.tasks(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  kind public.calendar_event_kind not null,
  title text not null check (char_length(title) between 1 and 500),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence public.recurrence_frequency not null default 'none',
  recurrence_series_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((kind = 'lesson' and student_id is not null) or kind <> 'lesson')
);

create table public.lesson_notes (
  event_id uuid primary key references public.calendar_events(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  topic text,
  homework text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  source public.inbox_source not null,
  external_id text,
  title text not null check (char_length(title) between 1 and 500),
  raw_text text,
  transcript text,
  received_at timestamptz not null default now(),
  status public.inbox_status not null default 'new',
  promoted_task_id uuid references public.tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, source, external_id)
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('morning_review', 'evening_review', 'task_deadline', 'lesson_reminder')),
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, scheduled_for)
);

create index tasks_user_status_due_idx on public.tasks (user_id, status, due_date);
create index tasks_user_category_status_idx on public.tasks (user_id, category_id, status);
create index calendar_events_user_starts_at_idx on public.calendar_events (user_id, starts_at);
create index calendar_events_student_starts_at_idx on public.calendar_events (student_id, starts_at) where student_id is not null;
create index inbox_items_user_status_received_idx on public.inbox_items (user_id, status, received_at desc);
create index task_attachments_task_id_idx on public.task_attachments (task_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.seed_default_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (user_id, name, sort_order, icon_key)
  values
    (new.id, 'Китай', 0, 'china'),
    (new.id, 'Реестр', 1, 'registry'),
    (new.id, 'Личное', 2, 'personal'),
    (new.id, 'Производство', 3, 'production'),
    (new.id, 'Финансы', 4, 'finance'),
    (new.id, 'Ученики', 5, 'students');
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email));
  return new;
end;
$$;

create trigger profiles_seed_categories
after insert on public.profiles for each row execute function public.seed_default_categories();

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger students_updated_at before update on public.students for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger lesson_notes_updated_at before update on public.lesson_notes for each row execute function public.set_updated_at();
create trigger inbox_items_updated_at before update on public.inbox_items for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.students enable row level security;
alter table public.tasks enable row level security;
alter table public.task_attachments enable row level security;
alter table public.calendar_events enable row level security;
alter table public.lesson_notes enable row level security;
alter table public.inbox_items enable row level security;
alter table public.notification_log enable row level security;

create policy "profiles are private" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "categories are private" on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "students are private" on public.students for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks are private" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "task attachments are private" on public.task_attachments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calendar events are private" on public.calendar_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lesson notes are private" on public.lesson_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "inbox items are private" on public.inbox_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notification log is private" on public.notification_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('planner-attachments', 'planner-attachments', false)
on conflict (id) do nothing;

create policy "private attachment reads" on storage.objects for select
using (bucket_id = 'planner-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private attachment uploads" on storage.objects for insert
with check (bucket_id = 'planner-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private attachment updates" on storage.objects for update
using (bucket_id = 'planner-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private attachment deletes" on storage.objects for delete
using (bucket_id = 'planner-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
