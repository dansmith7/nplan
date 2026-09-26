-- Make collection deletion explicit so clients can distinguish success from a
-- row filtered out by RLS. Related birthdays and generated calendar events are
-- removed by their existing ON DELETE CASCADE constraints.

create or replace function public.delete_collection_item(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.collection_items
  where id = p_item_id
    and user_id = (select auth.uid());

  if not found then
    raise exception 'Collection item not found';
  end if;
end;
$$;

revoke all on function public.delete_collection_item(uuid) from public;
grant execute on function public.delete_collection_item(uuid) to authenticated;
