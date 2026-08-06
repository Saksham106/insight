alter table public.conversations add column if not exists archived_at timestamptz;
create index if not exists idx_conversations_archived on public.conversations (archived_at);;
