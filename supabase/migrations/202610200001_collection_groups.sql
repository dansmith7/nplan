-- A lightweight, user-owned label lets every collection type share the same grouping UI.
alter table public.collection_items
  add column if not exists group_name text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.collection_items'::regclass
      and conname = 'collection_items_group_name_length_check'
  ) then
    alter table public.collection_items
      add constraint collection_items_group_name_length_check
      check (group_name is null or char_length(btrim(group_name)) between 1 and 80);
  end if;
end $$;

create index if not exists collection_items_user_type_group_idx
  on public.collection_items (user_id, type, group_name, created_at desc);
