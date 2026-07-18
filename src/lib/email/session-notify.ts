import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionEmail, type SessionEmailEvent } from "@/lib/email";

// Emails both the teacher and the student on an assignment about a session event,
// each with their own name, timezone, dashboard link, and their counterpart as the
// actor. Shared by single-session admin scheduling and batch group scheduling so
// notification behavior stays identical. Fire-and-forget; never throws to callers
// that don't await it.
export async function notifyAssignmentBothParties(params: {
  event: SessionEmailEvent;
  assignmentId: string;
  scheduledAt: string;
  durationMinutes: number;
  notes?: string | null;
}) {
  const admin = createAdminClient();

  const { data: assignment } = await admin
    .from("teacher_student_assignments")
    .select("teacher_id, student_id, teacher:teacher_id (full_name), student:student_id (full_name)")
    .eq("id", params.assignmentId)
    .single();

  if (!assignment) return;

  const teacher = Array.isArray(assignment.teacher) ? assignment.teacher[0] : assignment.teacher;
  const student = Array.isArray(assignment.student) ? assignment.student[0] : assignment.student;

  const teacherName = (teacher as { full_name: string } | null)?.full_name ?? "Teacher";
  const studentName = (student as { full_name: string } | null)?.full_name ?? "Student";

  const recipients = [
    { id: assignment.teacher_id as string, name: teacherName, otherName: studentName, role: "teacher" as const },
    { id: assignment.student_id as string, name: studentName, otherName: teacherName, role: "student" as const },
  ];

  await Promise.all(
    recipients.map(async (r) => {
      const [{ data: authUser }, { data: recipientProfile }] = await Promise.all([
        admin.auth.admin.getUserById(r.id),
        admin.from("profiles").select("timezone").eq("id", r.id).single(),
      ]);

      const recipientEmail = authUser?.user?.email;
      if (!recipientEmail) return;

      await sendSessionEmail({
        event: params.event,
        recipientEmail,
        recipientName: r.name,
        actorName: r.otherName,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        notes: params.notes,
        role: r.role,
        recipientTimezone: (recipientProfile as { timezone?: string | null } | null)?.timezone,
      });
    }),
  );
}
