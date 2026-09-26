-- Test-only inbox routing into collections. The source inbox row is untouched.

create table public.test_collection_inbox_links (
  inbox_id uuid not null references public.inbox_items(id) on delete cascade,
  item_id uuid not null references public.test_collection_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (inbox_id, user_id),
  unique (item_id)
);

create index test_collection_inbox_links_user_created_idx
  on public.test_collection_inbox_links (user_id, created_at desc);

alter table public.test_collection_inbox_links enable row level security;

create policy "test collection inbox links are private"
on public.test_collection_inbox_links
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.test_route_inbox_to_collection(
  p_inbox_id uuid,
  p_type public.test_collection_item_type,
  p_title text,
  p_note text default null,
  p_source_url text default null,
  p_image_url text default null,
  p_original_title text default null,
  p_release_year smallint default null,
  p_genres text[] default '{}',
  p_external_rating numeric default null,
  p_kinopoisk_id integer default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_item_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.inbox_items
    where id = p_inbox_id and user_id = v_user_id and status = 'new'
  ) then raise exception 'Inbox item not found'; end if;

  insert into public.test_collection_items (
    user_id, type, title, note, source_url, image_url
  ) values (
    v_user_id, p_type, btrim(p_title), nullif(btrim(p_note), ''),
    nullif(btrim(p_source_url), ''), nullif(btrim(p_image_url), '')
  ) returning id into v_item_id;

  if p_type = 'movie' then
    insert into public.test_collection_movies (
      item_id, user_id, original_title, release_year, genres,
      external_rating, kinopoisk_id
    ) values (
      v_item_id, v_user_id, nullif(btrim(p_original_title), ''), p_release_year,
      coalesce(p_genres, '{}'), p_external_rating, p_kinopoisk_id
    );
  end if;

  insert into public.test_collection_inbox_links (inbox_id, item_id, user_id)
  values (p_inbox_id, v_item_id, v_user_id);

  return v_item_id;
end;
$$;

revoke all on function public.test_route_inbox_to_collection(
  uuid, public.test_collection_item_type, text, text, text, text,
  text, smallint, text[], numeric, integer
) from public;
grant execute on function public.test_route_inbox_to_collection(
  uuid, public.test_collection_item_type, text, text, text, text,
  text, smallint, text[], numeric, integer
) to authenticated;
