-- Non-destructive archive for conversations. Admin "archiving" a group hides it
-- from group/chat listings without deleting the conversation or its message
-- history. Additive and backward compatible: existing rows keep archived_at null.
alter table public.conversations add column if not exists archived_at timestamptz;
create index if not exists idx_conversations_archived on public.conversations (archived_at);
