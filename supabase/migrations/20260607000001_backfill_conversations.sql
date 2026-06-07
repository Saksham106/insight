-- Create a conversation row for every assignment that doesn't already have one.
-- This backfills the existing assignment(s) so the "Open chat" button reappears.
INSERT INTO conversations (assignment_id)
SELECT id FROM teacher_student_assignments
WHERE id NOT IN (
  SELECT assignment_id FROM conversations WHERE assignment_id IS NOT NULL
);
