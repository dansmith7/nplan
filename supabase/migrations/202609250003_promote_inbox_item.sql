-- Promote an inbox item to a task atomically. The authenticated user must own
-- both the inbox item and target category; RLS remains enabled throughout.

create or replace function public.promote_inbox_item(
  p_inbox_id uuid,
  p_category_id uuid,
  p_title text,
  p_due_date date default null,
  p_due_time time default null,
  p_recurrence public.recurrence_frequency default 'none'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_task_id uuid;
  v_inbox_status public.inbox_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Task title is required';
  end if;

  select status
  into v_inbox_status
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
    select 1
    from public.categories
    where id = p_category_id
      and user_id = auth.uid()
  ) then
    raise exception 'Category not found';
  end if;

  insert into public.tasks (
    user_id,
    category_id,
    title,
    due_date,
    due_time,
    recurrence
  )
  values (
    auth.uid(),
    p_category_id,
    btrim(p_title),
    p_due_date,
    p_due_time,
    p_recurrence
  )
  returning id into v_task_id;

  update public.inbox_items
  set
    status = 'promoted',
    promoted_task_id = v_task_id
  where id = p_inbox_id
    and user_id = auth.uid();

  return v_task_id;
end;
$$;

revoke all on function public.promote_inbox_item(
  uuid,
  uuid,
  text,
  date,
  time,
  public.recurrence_frequency
) from public;

grant execute on function public.promote_inbox_item(
  uuid,
  uuid,
  text,
  date,
  time,
  public.recurrence_frequency
) to authenticated;
