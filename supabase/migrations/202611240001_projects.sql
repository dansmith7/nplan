create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'active' check (status in ('planned', 'active', 'completed')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

-- Include the owner in both foreign keys so a record cannot reference another account.
alter table public.categories add constraint categories_user_id_id_key unique (user_id, id);
alter table public.projects add constraint projects_category_fk
  foreign key (user_id, category_id) references public.categories (user_id, id);
alter table public.tasks add column project_id uuid;
alter table public.tasks add constraint tasks_project_fk
  foreign key (user_id, project_id) references public.projects (user_id, id)
  on delete set null (project_id);

create index projects_category_idx on public.projects (user_id, category_id);
create index tasks_project_idx on public.tasks (user_id, project_id) where project_id is not null;

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update on public.projects to authenticated;
create policy "projects are private" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-documents', 'project-documents', false, 52428800);

create policy "read own project documents" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "upload to own projects" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.user_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[2]
    )
  );

create policy "delete own project documents" on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
