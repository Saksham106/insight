alter table public.sessions add column if not exists group_session_id uuid;
create index if not exists idx_sessions_group on public.sessions (group_session_id);;
