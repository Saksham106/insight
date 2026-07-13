-- Covering indexes for FKs flagged by the performance advisor
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_notifications_session_id on public.notifications (session_id);
create index if not exists idx_sessions_cancelled_by on public.sessions (cancelled_by);
create index if not exists idx_sessions_proposed_by on public.sessions (proposed_by);

-- Composite index matching chat's access pattern (per-conversation, time-ordered);
-- fully covers the single-column conversation_id index it replaces
create index if not exists idx_messages_conversation_created on public.messages (conversation_id, created_at desc);
drop index if exists public.idx_messages_conversation_id;

-- Unused indexes flagged by the advisor (sessions.assignment_id stays covered by idx_sessions_assignment_id)
drop index if exists public.idx_teacher_labels_label_id;
drop index if exists public.idx_join_interest_requests_created_at;
drop index if exists public.idx_join_interest_requests_status;
drop index if exists public.idx_sessions_assignment_status_time;

-- RLS helper functions are read-only; STABLE lets the planner cache results within a statement
alter function public.is_admin() stable;
alter function public.is_teacher() stable;
alter function public.is_student() stable;
alter function public.is_parent() stable;
alter function public.teacher_can_access_student(uuid) stable;
alter function public.student_can_access_teacher(uuid) stable;
alter function public.parent_can_access_student(uuid) stable;
alter function public.parent_can_access_teacher(uuid) stable;

-- Advisor: pin search_path on the trigger function
alter function public.set_updated_at() set search_path = public;
