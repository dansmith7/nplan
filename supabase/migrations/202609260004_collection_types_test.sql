-- Specialized test collection records and isolated birthday calendar events.

create table public.test_collection_purchases (
  item_id uuid primary key,
  user_id uuid not null default auth.uid(),
  price_amount numeric(12,2) check (price_amount >= 0),
  currency text not null default 'RUB' check (currency in ('RUB','CNY','USD','EUR')),
  foreign key (item_id,user_id) references public.test_collection_items(id,user_id) on delete cascade
);

create table public.test_collection_birthdays (
  item_id uuid primary key,
  user_id uuid not null default auth.uid(),
  birth_date date,
  foreign key (item_id,user_id) references public.test_collection_items(id,user_id) on delete cascade
);

create table public.test_collection_places (
  item_id uuid primary key,
  user_id uuid not null default auth.uid(),
  location text,
  map_url text,
  visited boolean not null default false,
  foreign key (item_id,user_id) references public.test_collection_items(id,user_id) on delete cascade
);

create table public.test_collection_learning (
  item_id uuid primary key,
  user_id uuid not null default auth.uid(),
  content_kind text not null default 'other'
    check (content_kind in ('book','article','video','course','podcast','other')),
  status text not null default 'saved'
    check (status in ('saved','in_progress','completed')),
  foreign key (item_id,user_id) references public.test_collection_items(id,user_id) on delete cascade
);

create table public.test_collection_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  item_id uuid not null references public.test_collection_items(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occurrence_year smallint not null,
  unique (item_id,occurrence_year),
  check (ends_at > starts_at)
);

alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('morning_review','evening_review','task_deadline','lesson_reminder','birthday_reminder'));

create index test_collection_purchases_user_idx on public.test_collection_purchases(user_id);
create index test_collection_birthdays_user_date_idx on public.test_collection_birthdays(user_id,birth_date);
create index test_collection_places_user_idx on public.test_collection_places(user_id);
create index test_collection_learning_user_status_idx on public.test_collection_learning(user_id,status);
create index test_collection_calendar_events_user_start_idx on public.test_collection_calendar_events(user_id,starts_at);

alter table public.test_collection_purchases enable row level security;
alter table public.test_collection_birthdays enable row level security;
alter table public.test_collection_places enable row level security;
alter table public.test_collection_learning enable row level security;
alter table public.test_collection_calendar_events enable row level security;

create policy "test purchases are private" on public.test_collection_purchases for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "test birthdays are private" on public.test_collection_birthdays for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "test places are private" on public.test_collection_places for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "test learning is private" on public.test_collection_learning for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "test collection calendar is private" on public.test_collection_calendar_events for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create function public.test_save_collection_item(
  p_item_id uuid,
  p_type public.test_collection_item_type,
  p_title text,
  p_note text,
  p_source_url text,
  p_image_url text,
  p_price_amount numeric,
  p_currency text,
  p_birth_date date,
  p_location text,
  p_map_url text,
  p_visited boolean,
  p_content_kind text,
  p_content_status text
)
returns uuid
language plpgsql
set search_path=public
as $$
declare
  v_item_id uuid := p_item_id;
  v_user_id uuid := (select auth.uid());
  v_year integer;
  v_month integer;
  v_day integer;
  v_date date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  if v_item_id is null then
    insert into public.test_collection_items(user_id,type,title,note,source_url,image_url)
    values(v_user_id,p_type,btrim(p_title),nullif(btrim(p_note),''),nullif(btrim(p_source_url),''),nullif(btrim(p_image_url),''))
    returning id into v_item_id;
  else
    update public.test_collection_items set title=btrim(p_title),note=nullif(btrim(p_note),''),source_url=nullif(btrim(p_source_url),''),image_url=nullif(btrim(p_image_url),'')
    where id=v_item_id and user_id=v_user_id and type=p_type;
    if not found then raise exception 'Collection item not found'; end if;
  end if;

  if p_type='purchase' then
    insert into public.test_collection_purchases(item_id,user_id,price_amount,currency)
    values(v_item_id,v_user_id,p_price_amount,coalesce(nullif(p_currency,''),'RUB'))
    on conflict(item_id) do update set price_amount=excluded.price_amount,currency=excluded.currency;
  elsif p_type='birthday' then
    insert into public.test_collection_birthdays(item_id,user_id,birth_date)
    values(v_item_id,v_user_id,p_birth_date)
    on conflict(item_id) do update set birth_date=excluded.birth_date;
    delete from public.test_collection_calendar_events where item_id=v_item_id and user_id=v_user_id;
    if p_birth_date is not null then
      v_month := extract(month from p_birth_date);
      v_day := extract(day from p_birth_date);
      for v_year in extract(year from current_date)::integer..extract(year from current_date)::integer+5 loop
        v_date := make_date(v_year,v_month,least(v_day,extract(day from (make_date(v_year,v_month,1)+interval '1 month - 1 day'))::integer));
        insert into public.test_collection_calendar_events(user_id,item_id,title,starts_at,ends_at,occurrence_year)
        values(v_user_id,v_item_id,'День рождения · '||btrim(p_title),(v_date+time '09:00') at time zone 'Europe/Moscow',(v_date+time '09:30') at time zone 'Europe/Moscow',v_year);
      end loop;
    end if;
  elsif p_type='place' then
    insert into public.test_collection_places(item_id,user_id,location,map_url,visited)
    values(v_item_id,v_user_id,nullif(btrim(p_location),''),nullif(btrim(p_map_url),''),coalesce(p_visited,false))
    on conflict(item_id) do update set location=excluded.location,map_url=excluded.map_url,visited=excluded.visited;
  elsif p_type='learning' then
    insert into public.test_collection_learning(item_id,user_id,content_kind,status)
    values(v_item_id,v_user_id,coalesce(nullif(p_content_kind,''),'other'),coalesce(nullif(p_content_status,''),'saved'))
    on conflict(item_id) do update set content_kind=excluded.content_kind,status=excluded.status;
  end if;
  return v_item_id;
end;
$$;

revoke all on function public.test_save_collection_item(uuid,public.test_collection_item_type,text,text,text,text,numeric,text,date,text,text,boolean,text,text) from public;
grant execute on function public.test_save_collection_item(uuid,public.test_collection_item_type,text,text,text,text,numeric,text,date,text,text,boolean,text,text) to authenticated;
