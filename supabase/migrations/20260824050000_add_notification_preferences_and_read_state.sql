-- Persist read state across devices and let each user control notification categories.

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz not null default now();

alter table public.profiles
  add column if not exists notify_chat_messages boolean not null default true,
  add column if not exists notify_session_changes boolean not null default true;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_read_at timestamptz := clock_timestamp();
begin
  update public.conversation_participants
  set last_read_at = v_read_at
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  if not found then
    raise exception 'conversation_not_found';
  end if;

  return v_read_at;
end;
$$;

-- Keep the existing JSON signature so deployed clients continue working, but
-- ignore browser-provided timestamps. The participant row is authoritative.
-- A user's own sent messages are never unread.
create or replace function public.get_unread_counts(p_conversations jsonb)
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct item.conversation_id
    from jsonb_to_recordset(coalesce(p_conversations, '[]'::jsonb))
      as item(conversation_id uuid, last_read timestamptz)
  )
  select participant.conversation_id,
         count(message.id)::bigint as unread_count
  from public.conversation_participants participant
  join requested on requested.conversation_id = participant.conversation_id
  left join public.messages message
    on message.conversation_id = participant.conversation_id
   and message.sender_id <> auth.uid()
   and message.created_at > participant.last_read_at
  where participant.user_id = auth.uid()
  group by participant.conversation_id;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
revoke execute on function public.get_unread_counts(jsonb) from public, anon;
grant execute on function public.get_unread_counts(jsonb) to authenticated, service_role;

create index if not exists idx_conversation_participants_unread
  on public.conversation_participants (user_id, conversation_id, last_read_at);
