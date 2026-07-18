-- Link sessions scheduled together as one "group class". When the admin schedules
-- for N students at once, N per-pair sessions are created sharing this id so they
-- can be displayed and cancelled as a unit. Null for ordinary 1:1 sessions.
alter table public.sessions add column if not exists group_session_id uuid;
create index if not exists idx_sessions_group on public.sessions (group_session_id);
