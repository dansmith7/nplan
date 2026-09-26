-- Test-only Kinopoisk metadata for the movies collection.

alter table public.test_collection_movies
  add column kinopoisk_id integer check (kinopoisk_id > 0);

create index test_collection_movies_user_kinopoisk_idx
  on public.test_collection_movies (user_id, kinopoisk_id)
  where kinopoisk_id is not null;

drop function public.test_create_collection_movie(
  text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
);

drop function public.test_update_collection_movie(
  uuid, text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status
);

create function public.test_create_collection_movie(
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
  p_status public.test_movie_watch_status default 'want_to_watch',
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

  insert into public.test_collection_items (
    user_id, type, title, note, source_url, image_url
  ) values (
    v_user_id, 'movie', btrim(p_title), nullif(btrim(p_note), ''),
    nullif(btrim(p_source_url), ''), nullif(btrim(p_image_url), '')
  ) returning id into v_item_id;

  insert into public.test_collection_movies (
    item_id, user_id, original_title, release_year, duration_minutes,
    genres, director, recommended_by, status, external_rating, kinopoisk_id
  ) values (
    v_item_id, v_user_id, nullif(btrim(p_original_title), ''), p_release_year,
    p_duration_minutes, coalesce(p_genres, '{}'), nullif(btrim(p_director), ''),
    nullif(btrim(p_recommended_by), ''), p_status, p_external_rating, p_kinopoisk_id
  );

  return v_item_id;
end;
$$;

create function public.test_update_collection_movie(
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
  p_status public.test_movie_watch_status default 'want_to_watch',
  p_external_rating numeric default null,
  p_kinopoisk_id integer default null
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
  where id = p_item_id and user_id = (select auth.uid()) and type = 'movie';

  if not found then raise exception 'Movie not found'; end if;

  update public.test_collection_movies
  set original_title = nullif(btrim(p_original_title), ''),
      release_year = p_release_year,
      duration_minutes = p_duration_minutes,
      genres = coalesce(p_genres, '{}'),
      director = nullif(btrim(p_director), ''),
      recommended_by = nullif(btrim(p_recommended_by), ''),
      status = p_status,
      external_rating = p_external_rating,
      kinopoisk_id = p_kinopoisk_id
  where item_id = p_item_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.test_create_collection_movie(
  text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status, numeric, integer
) from public;
grant execute on function public.test_create_collection_movie(
  text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status, numeric, integer
) to authenticated;

revoke all on function public.test_update_collection_movie(
  uuid, text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status, numeric, integer
) from public;
grant execute on function public.test_update_collection_movie(
  uuid, text, text, smallint, smallint, text[], text, text, text, text, text,
  public.test_movie_watch_status, numeric, integer
) to authenticated;
