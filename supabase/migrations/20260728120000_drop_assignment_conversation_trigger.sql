-- Retire the assignment -> conversation trigger.
--
-- The trigger dates from when a conversation WAS a 1:1 mirror of a
-- teacher_student_assignment: every new assignment row auto-created a matching
-- conversation. The group redesign inverted that relationship — a conversation
-- is now the primary object (N participants + an optional name) and assignments
-- are DERIVED from its membership by ensureAssignments() in src/lib/chat/data.ts.
--
-- With the relationship inverted, the trigger duplicates work. Creating a
-- two-person teacher+student chat produced TWO conversations: the one the admin
-- created, plus one the trigger created from the assignment that was derived
-- from it. Because group-vs-DM is now derived from roster size, both rendered
-- identically in the unified admin Chats list — indistinguishable duplicates for
-- the same pair. Adding a student to a group spawned another one per new
-- teacher x student pair.
--
-- Only two paths insert assignments:
--   1. POST /api/admin/assign — a deliberate pairing. It already creates the
--      conversation itself via its own ensureConversation() helper, so it never
--      needed the trigger. That helper now also inserts the two participants,
--      which is the only thing the trigger did that it didn't.
--   2. ensureAssignments() — derivation from a conversation that already exists.
--      This is the path that was creating duplicates.
--
-- Existing trigger-created conversations are left exactly as they are: this drops
-- the automation, not any data.

drop trigger if exists create_conversation_after_assignment on public.teacher_student_assignments;
drop function if exists public.create_conversation_for_assignment();
