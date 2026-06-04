import { TeacherDashboard } from "@/components/teacher/teacher-dashboard";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";
import type { Session } from "@/components/sessions/session-card";

interface AssignmentRow {
  id: string;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

export default async function TeacherPage() {
  const profile = await requireRole(["teacher"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select(
      "id, student:student_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
    )
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false });

  const assignments = (data ?? []).map((assignment) => {
    const student = Array.isArray(assignment.student)
      ? assignment.student[0]
      : assignment.student;
    const rawConv = assignment.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    const sessions = (assignment.sessions ?? []) as Session[];
    return { ...assignment, student, conversation, sessions } as AssignmentRow;
  });

  return <TeacherDashboard assignments={assignments} teacherId={profile.id} />;
}
