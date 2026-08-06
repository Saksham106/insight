-- Retire the assignment -> conversation trigger.
--
-- The trigger dates from when a conversation WAS a 1:1 mirror of a
-- teacher_student_assignment. The group redesign inverted that relationship — a
-- conversation is now the primary object and assignments are DERIVED from its
-- membership by ensureAssignments() in src/lib/chat/data.ts. With the
-- relationship inverted, the trigger duplicated any conversation whose own
-- creation had derived the assignment.
--
-- Only /api/admin/assign and ensureAssignments() insert assignments. The former
-- already creates its conversation in application code (and now its participants
-- too); the latter is the path that was creating duplicates.
--
-- This drops the automation, not any data.

drop trigger if exists create_conversation_after_assignment on public.teacher_student_assignments;
drop function if exists public.create_conversation_for_assignment();;
