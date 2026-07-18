import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { sendSessionEmail } from "@/lib/email";
import { notifyAssignmentBothParties } from "@/lib/email/session-notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { assignment_id, scheduled_at, duration_minutes, notes, proposed_by } = body;

  const isAdmin = profile.role === "admin";

  // Admin schedules on behalf of the pair, so proposed_by is derived server-side.
  if (!assignment_id || !scheduled_at || !duration_minutes || (!isAdmin && !proposed_by)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (new Date(scheduled_at) <= new Date()) {
    return NextResponse.json({ error: "Cannot schedule a session in the past." }, { status: 400 });
  }

  const supabase = await createClient();

  // Insert the session. Admin-created sessions are auto-confirmed (no approval
  // required from either party); teacher/student sessions start as 'proposed'.
  const insertPayload: Record<string, unknown> = {
    assignment_id,
    scheduled_at,
    duration_minutes,
    notes: notes ?? null,
    proposed_by: isAdmin ? profile.id : proposed_by,
  };

  if (isAdmin) {
    insertPayload.status = "confirmed";
    insertPayload.booking_source = "manual";
  }

  const { data: session, error: insertError } = await supabase
    .from("sessions")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  revalidateTag("dashboard", "max");

  // Notify — fire and forget. Admin sessions notify BOTH parties; a teacher/student
  // proposal notifies only the other party.
  if (isAdmin) {
    notifyAssignmentBothParties({
      event: "scheduled",
      assignmentId: assignment_id,
      scheduledAt: scheduled_at,
      durationMinutes: duration_minutes,
      notes,
    }).catch((e) => console.error("[email] admin session scheduled:", e));
  } else {
    sendNotification("proposed", assignment_id, proposed_by, scheduled_at, duration_minutes, notes).catch(() => {});
  }

  return NextResponse.json({ sessionId: session.id });
}

async function sendNotification(
  event: "proposed" | "confirmed" | "cancelled" | "rescheduled",
  assignmentId: string,
  actorId: string,
  scheduledAt: string,
  durationMinutes: number,
  notes?: string | null,
) {
  const admin = createAdminClient();

  // Get assignment with teacher + student profiles
  const { data: assignment } = await admin
    .from("teacher_student_assignments")
    .select("teacher_id, student_id, teacher:teacher_id (full_name), student:student_id (full_name)")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return;

  const teacher = Array.isArray(assignment.teacher) ? assignment.teacher[0] : assignment.teacher;
  const student = Array.isArray(assignment.student) ? assignment.student[0] : assignment.student;

  const teacherId = assignment.teacher_id as string;
  const studentId = assignment.student_id as string;
  const teacherName = (teacher as { full_name: string } | null)?.full_name ?? "Teacher";
  const studentName = (student as { full_name: string } | null)?.full_name ?? "Student";

  // Determine recipient (the OTHER party)
  const actorIsTeacher = actorId === teacherId;
  const recipientId = actorIsTeacher ? studentId : teacherId;
  const recipientName = actorIsTeacher ? studentName : teacherName;
  const actorName = actorIsTeacher ? teacherName : studentName;
  const recipientRole: "teacher" | "student" = actorIsTeacher ? "student" : "teacher";

  const [{ data: authUser }, { data: recipientProfile }] = await Promise.all([
    admin.auth.admin.getUserById(recipientId),
    admin.from("profiles").select("timezone").eq("id", recipientId).single(),
  ]);

  const recipientEmail = authUser?.user?.email;
  if (!recipientEmail) return;

  await sendSessionEmail({
    event,
    recipientEmail,
    recipientName,
    actorName,
    scheduledAt,
    durationMinutes,
    notes,
    role: recipientRole,
    recipientTimezone: (recipientProfile as { timezone?: string | null } | null)?.timezone,
  });
}
