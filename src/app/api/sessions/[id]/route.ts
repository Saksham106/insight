import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendSessionEmail, type SessionEmailEvent } from "@/lib/email";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { status, scheduled_at, duration_minutes, notes, proposed_by, cancelled_by } = body;

  const supabase = await createClient();

  // Fetch current session before update (need assignment_id + old data for email)
  const { data: existing } = await supabase
    .from("sessions")
    .select("assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (status !== undefined) updatePayload.status = status;
  if (scheduled_at !== undefined) updatePayload.scheduled_at = scheduled_at;
  if (duration_minutes !== undefined) updatePayload.duration_minutes = duration_minutes;
  if (notes !== undefined) updatePayload.notes = notes;
  if (proposed_by !== undefined) updatePayload.proposed_by = proposed_by;
  if (cancelled_by !== undefined) updatePayload.cancelled_by = cancelled_by;

  const { error: updateError } = await supabase
    .from("sessions")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Determine what event happened and who to notify
  const newScheduledAt = scheduled_at ?? existing.scheduled_at;
  const newDuration = duration_minutes ?? existing.duration_minutes;
  const newNotes = notes !== undefined ? notes : existing.notes;
  const actorId = profile.id;

  let event: SessionEmailEvent | null = null;
  if (status === "confirmed") event = "confirmed";
  else if (status === "cancelled") event = "cancelled";
  else if (scheduled_at !== undefined) event = "rescheduled"; // reschedule = new time proposed

  if (event) {
    sendNotification(event, existing.assignment_id, actorId, newScheduledAt, newDuration, newNotes).catch((e) => console.error("[email] session update:", e));
  }

  return NextResponse.json({ success: true });
}

async function sendNotification(
  event: SessionEmailEvent,
  assignmentId: string,
  actorId: string,
  scheduledAt: string,
  durationMinutes: number,
  notes?: string | null,
) {
  const admin = createAdminClient();

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

  const actorIsTeacher = actorId === teacherId;
  const recipientId = actorIsTeacher ? studentId : teacherId;
  const recipientName = actorIsTeacher ? studentName : teacherName;
  const actorName = actorIsTeacher ? teacherName : studentName;
  const recipientRole: "teacher" | "student" = actorIsTeacher ? "student" : "teacher";

  const { data: authUser } = await admin.auth.admin.getUserById(recipientId);
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
  });
}
