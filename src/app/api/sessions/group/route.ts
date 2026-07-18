import { randomUUID } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { notifyAssignmentBothParties } from "@/lib/email/session-notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin schedules one confirmed session per selected student (a "group class").
// Each session references that student's existing (teacher, student) assignment;
// all share a group_session_id so they display and cancel as one unit.
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const teacherId: unknown = body?.teacherId;
  const studentIds: unknown = body?.studentIds;
  const scheduledAt: unknown = body?.scheduled_at;
  const durationMinutes: unknown = body?.duration_minutes;
  const notes: unknown = body?.notes;

  if (typeof teacherId !== "string" || !teacherId) {
    return NextResponse.json({ error: "Choose a teacher." }, { status: 400 });
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.some((s) => typeof s !== "string")) {
    return NextResponse.json({ error: "Choose at least one student." }, { status: 400 });
  }
  if (typeof scheduledAt !== "string" || Number.isNaN(new Date(scheduledAt).getTime())) {
    return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
  }
  if (new Date(scheduledAt) <= new Date()) {
    return NextResponse.json({ error: "Cannot schedule a session in the past." }, { status: 400 });
  }
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "Choose a valid duration." }, { status: 400 });
  }

  const admin = createAdminClient();
  const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  // Resolve the active assignment for each (teacher, student). Students without one
  // are skipped rather than failing the whole batch.
  const { data: assignments } = await admin
    .from("teacher_student_assignments")
    .select("id, student_id")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .in("student_id", studentIds as string[]);

  const assignmentByStudent = new Map((assignments ?? []).map((a) => [a.student_id as string, a.id as string]));
  const targeted = (studentIds as string[])
    .map((studentId) => ({ studentId, assignmentId: assignmentByStudent.get(studentId) }))
    .filter((t): t is { studentId: string; assignmentId: string } => Boolean(t.assignmentId));
  const skipped = (studentIds as string[]).filter((s) => !assignmentByStudent.has(s)).length;

  if (targeted.length === 0) {
    return NextResponse.json(
      { error: "None of the selected students are assigned to this teacher." },
      { status: 400 },
    );
  }

  const groupSessionId = randomUUID();

  const rows = targeted.map((t) => ({
    assignment_id: t.assignmentId,
    scheduled_at: scheduledAt,
    duration_minutes: duration,
    notes: cleanNotes,
    status: "confirmed",
    booking_source: "manual",
    proposed_by: profile.id,
    group_session_id: groupSessionId,
  }));

  const { error: insertError } = await admin.from("sessions").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  revalidateTag("dashboard", "max");

  // Notify each pair — fire and forget.
  for (const t of targeted) {
    notifyAssignmentBothParties({
      event: "scheduled",
      assignmentId: t.assignmentId,
      scheduledAt,
      durationMinutes: duration,
      notes: cleanNotes,
    }).catch((e) => console.error("[email] group session scheduled:", e));
  }

  return NextResponse.json({ groupSessionId, count: targeted.length, skipped });
}
