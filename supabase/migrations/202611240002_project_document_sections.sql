create table public.project_document_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  name text not null check (
    name = btrim(name) and char_length(name) between 1 and 80 and lower(name) <> 'без раздела'
  ),
  foreign key (user_id, project_id) references public.projects (user_id, id) on delete cascade
);

create unique index project_document_sections_unique_name
  on public.project_document_sections (user_id, project_id, lower(name));

alter table public.project_document_sections enable row level security;
revoke all on public.project_document_sections from anon, authenticated;
grant select, insert, update (name) on public.project_document_sections to authenticated;
create policy "project document sections are private"
  on public.project_document_sections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Existing files keep their two-folder path. Section IDs add an optional
-- third folder so renaming a section never needs to move its files.
create function public.can_write_project_document(path text)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select folders[1] = owner_id::text
    and case cardinality(folders)
      when 2 then exists (
        select 1 from public.projects p
        where p.user_id = owner_id and p.id::text = folders[2]
      )
      when 3 then exists (
        select 1 from public.project_document_sections s
        where s.user_id = owner_id and s.project_id::text = folders[2]
          and s.id::text = folders[3]
      )
      else false
    end
  from (select storage.foldername(path) as folders, (select auth.uid()) as owner_id) parts
$$;

revoke all on function public.can_write_project_document(text) from public, anon, authenticated;
grant execute on function public.can_write_project_document(text) to authenticated;

alter policy "upload to own projects" on storage.objects
  with check (bucket_id = 'project-documents' and public.can_write_project_document(name));

create policy "move own project documents" on storage.objects for update to authenticated
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (bucket_id = 'project-documents' and public.can_write_project_document(name));
