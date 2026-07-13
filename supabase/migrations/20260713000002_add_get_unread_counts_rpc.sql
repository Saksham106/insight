-- Aggregated unread counts: one round trip instead of one HEAD count per conversation.
-- SECURITY INVOKER (default) so messages RLS still scopes what each user can count.
-- p_conversations: [{"conversation_id": "<uuid>", "last_read": "<timestamptz|null>"}, ...]
create or replace function public.get_unread_counts(p_conversations jsonb)
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
set search_path = public
as $$
  select m.conversation_id, count(*)::bigint as unread_count
  from public.messages m
  join jsonb_to_recordset(coalesce(p_conversations, '[]'::jsonb))
    as p(conversation_id uuid, last_read timestamptz)
    on p.conversation_id = m.conversation_id
  where m.sender_id <> (select auth.uid())
    and (p.last_read is null or m.created_at > p.last_read)
  group by m.conversation_id;
$$;

revoke execute on function public.get_unread_counts(jsonb) from public, anon;
grant execute on function public.get_unread_counts(jsonb) to authenticated, service_role;
