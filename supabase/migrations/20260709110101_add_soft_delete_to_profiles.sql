-- Soft delete for profiles.
--
-- Hard deleting a profile cascades into messages, teacher_student_assignments,
-- conversations, teacher_labels, notifications and parent_student_links, and
-- fails outright on sessions.proposed_by (NO ACTION). Soft delete keeps the
-- tutoring record intact and is reversible.
--
-- Deleting also clears is_active, so the existing is_active gates in
-- requireUser(), /api/auth/session and the profiles_select_self RLS policy
-- block sign-in with no additional auth code.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- Admin list queries filter on deleted_at is null; index only the live rows.
create index if not exists idx_profiles_not_deleted
  on public.profiles (role, created_at desc)
  where deleted_at is null;
