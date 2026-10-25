-- Older desktop clients omit p_description. Preserve the original message body
-- for them; an explicit empty string from the current form clears the description.
create or replace function public.promote_inbox_item(
  p_inbox_id uuid,
  p_category_id uuid,
  p_title text,
  p_due_date date default null,
  p_due_time time default null,
  p_recurrence public.recurrence_frequency default 'none',
  p_description text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_task_id uuid;
  v_inbox_status public.inbox_status;
  v_inbox_source public.inbox_source;
  v_inbox_title text;
  v_inbox_text text;
  v_description text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Task title is required';
  end if;

  select status, source, title, coalesce(nullif(transcript, ''), raw_text, '')
  into v_inbox_status, v_inbox_source, v_inbox_title, v_inbox_text
  from public.inbox_items
  where id = p_inbox_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Inbox item not found';
  end if;

  if v_inbox_status <> 'new' then
    raise exception 'Inbox item has already been processed';
  end if;

  if not exists (
    select 1 from public.categories
    where id = p_category_id and user_id = auth.uid()
  ) then
    raise exception 'Category not found';
  end if;

  v_description := p_description;
  if p_description is null then
    v_inbox_text := replace(v_inbox_text, E'\r\n', E'\n');
    if v_inbox_source = 'telegram'
      and btrim(split_part(v_inbox_text, E'\n', 1)) = v_inbox_title
    then
      v_description := case
        when position(E'\n' in v_inbox_text) = 0 then null
        else substr(v_inbox_text, position(E'\n' in v_inbox_text) + 1)
      end;
    else
      v_description := v_inbox_text;
    end if;
  end if;

  insert into public.tasks (
    user_id, category_id, title, description, due_date, due_time, recurrence
  )
  values (
    auth.uid(), p_category_id, btrim(p_title),
    nullif(btrim(v_description, E' \t\r\n'), ''),
    p_due_date, p_due_time, p_recurrence
  )
  returning id into v_task_id;

  update public.inbox_items
  set status = 'promoted', promoted_task_id = v_task_id
  where id = p_inbox_id and user_id = auth.uid();

  return v_task_id;
end;
$$;
