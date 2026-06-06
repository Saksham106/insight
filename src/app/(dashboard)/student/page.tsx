import { StudentDashboard } from "@/components/student/student-dashboard";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";
import type { Session } from "@/components/sessions/session-card";

interface AssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

export default async function StudentPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select(
      "id, teacher:teacher_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
    )
    .eq("student_id", profile.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const assignments: AssignmentRow[] = (data ?? []).map((row) => {
    const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
    const rawConv = row.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    const sessions = ((row.sessions ?? []) as Session[]).sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
    return { ...row, teacher, conversation, sessions } as AssignmentRow;
  });

  return <StudentDashboard assignments={assignments} studentId={profile.id} />;
}
