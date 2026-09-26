-- Collections foundation and the first concrete collection: movies.

create type public.test_collection_item_type as enum (
  'movie',
  'purchase',
  'birthday',
  'place',
  'learning',
  'idea'
);

create type public.test_movie_watch_status as enum (
  'want_to_watch',
  'watching',
  'watched',
  'postponed'
);

create table public.test_collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type public.test_collection_item_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  note text,
  source_url text,
  image_url text,
  promoted_task_id uuid references public.tasks(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.test_collection_movies (
  item_id uuid primary key,
  user_id uuid not null default auth.uid(),
  original_title text,
  release_year smallint check (release_year between 1888 and 2200),
  duration_minutes smallint check (duration_minutes between 1 and 1440),
  genres text[] not null default '{}',
  director text,
  cast_names text[] not null default '{}',
  external_rating numeric(3, 1) check (external_rating between 0 and 10),
  watch_provider text,
  trailer_url text,
  recommended_by text,
  personal_rating numeric(3, 1) check (personal_rating between 0 and 10),
  status public.test_movie_watch_status not null default 'want_to_watch',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_collection_movies_item_owner_fkey
    foreign key (item_id, user_id)
    references public.test_collection_items(id, user_id)
    on delete cascade
);

create index test_collection_items_user_type_created_idx
  on public.test_collection_items (user_id, type, created_at desc);
create index test_collection_items_promoted_task_idx
  on public.test_collection_items (promoted_task_id)
  where promoted_task_id is not null;
create index test_collection_items_calendar_event_idx
  on public.test_collection_items (calendar_event_id)
  where calendar_event_id is not null;
create index test_collection_movies_user_status_idx
  on public.test_collection_movies (user_id, status, created_at desc);

create trigger test_collection_items_updated_at
before update on public.test_collection_items
for each row execute function public.set_updated_at();

create trigger test_collection_movies_updated_at
before update on public.test_collection_movies
for each row execute function public.set_updated_at();

alter table public.test_collection_items enable row level security;
alter table public.test_collection_movies enable row level security;

create policy "collection items are private"
on public.test_collection_items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "collection movies are private"
on public.test_collection_movies
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.test_create_collection_movie(
  p_title text,
  p_original_title text default null,
  p_release_year smallint default null,
  p_duration_minutes smallint default null,
  p_genres text[] default '{}',
  p_director text default null,
  p_image_url text default null,
  p_source_url text default null,
  p_note text default null,
  p_recommended_by text default null,
  p_status public.test_movie_watch_status default 'want_to_watch'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_item_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.test_collection_items (
    user_id, type, title, note, source_url, image_url
  ) values (
    v_user_id, 'movie', btrim(p_title), nullif(btrim(p_note), ''),
    nullif(btrim(p_source_url), ''), nullif(btrim(p_image_url), '')
  ) returning id into v_item_id;

  insert into public.test_collection_movies (
    item_id, user_id, original_title, release_year, duration_minutes,
    genres, director, recommended_by, status
  ) values (
    v_item_id, v_user_id, nullif(btrim(p_original_title), ''), p_release_year,
    p_duration_minutes, coalesce(p_genres, '{}'), nullif(btrim(p_director), ''),
    nullif(btrim(p_recommended_by), ''), p_status
  );

  return v_item_id;
end;
$$;

create or replace function public.test_update_collection_movie(
  p_item_id uuid,
  p_title text,
  p_original_title text default null,
  p_release_year smallint default null,
  p_duration_minutes smallint default null,
  p_genres text[] default '{}',
  p_director text default null,
  p_image_url text default null,
  p_source_url text default null,
  p_note text default null,
  p_recommended_by text default null,
  p_status public.test_movie_watch_status default 'want_to_watch'
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.test_collection_items
  set title = btrim(p_title),
      note = nullif(btrim(p_note), ''),
      source_url = nullif(btrim(p_source_url), ''),
      image_url = nullif(btrim(p_image_url), '')
  where id = p_item_id
    and user_id = (select auth.uid())
    and type = 'movie';

  if not found then
    raise exception 'Movie not found';
  end if;

  update public.test_collection_movies
  set original_title = nullif(btrim(p_original_title), ''),
      release_year = p_release_year,
      duration_minutes = p_duration_minutes,
      genres = coalesce(p_genres, '{}'),
      director = nullif(btrim(p_director), ''),
      recommended_by = nullif(btrim(p_recommended_by), ''),
      status = p_status
  where item_id = p_item_id
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.test_create_collection_movie(
  text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
) from public;
grant execute on function public.test_create_collection_movie(
  text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
) to authenticated;

revoke all on function public.test_update_collection_movie(
  uuid, text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
) from public;
grant execute on function public.test_update_collection_movie(
  uuid, text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
) to authenticated;
