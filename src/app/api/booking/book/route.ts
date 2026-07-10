import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  getAssignmentParticipants,
  getBusySessionsForParticipants,
  getTeacherAvailabilityBundle,
} from "@/lib/availability/data";
import { generateAvailabilitySlots } from "@/lib/availability/slot-engine";
import { sendSessionEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SLOT_TAKEN_MESSAGE = "That time was just booked. Pick another slot.";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { assignment_id, scheduled_at, duration_minutes, notes } = body;

  if (!assignment_id || !scheduled_at || !duration_minutes) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const scheduledDate = new Date(scheduled_at);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduled_at." }, { status: 400 });
  }

  const participants = await getAssignmentParticipants(assignment_id);
  if (!participants) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  if (profile.id !== participants.studentId) {
    return NextResponse.json(
      { error: "Only the assigned student can book this session." },
      { status: 403 },
    );
  }

  const bundle = await getTeacherAvailabilityBundle(participants.teacherId);

  // Recompute availability for the target day server-side — never trust the client's slot list.
  const dayStart = new Date(scheduledDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const busySessions = await getBusySessionsForParticipants({
    teacherId: participants.teacherId,
    studentId: participants.studentId,
    from: dayStart,
    to: dayEnd,
  });

  const slots = generateAvailabilitySlots({
    settings: bundle.settings,
    rules: bundle.rules,
    overrides: bundle.overrides,
    busySessions,
    durationMinutes: duration_minutes,
    from: dayStart,
    to: dayEnd,
    now: new Date(),
  });

  const matchesSlot = slots.some((slot) => slot.starts_at === scheduledDate.toISOString());
  if (!matchesSlot) {
    return NextResponse.json({ error: SLOT_TAKEN_MESSAGE }, { status: 409 });
  }

  const supabase = await createClient();

  const { data: sessionId, error: rpcError } = await supabase.rpc("book_availability_session", {
    p_assignment_id: assignment_id,
    p_student_id: profile.id,
    p_scheduled_at: scheduledDate.toISOString(),
    p_duration_minutes: duration_minutes,
    p_notes: notes ?? null,
    p_auto_confirm: bundle.settings.auto_confirm,
  });

  if (rpcError) {
    return NextResponse.json({ error: SLOT_TAKEN_MESSAGE }, { status: 409 });
  }

  revalidateTag("dashboard", "max");

  const event = bundle.settings.auto_confirm ? "confirmed" : "proposed";
  sendNotification(event, participants.teacherId, profile.id, scheduledDate.toISOString(), duration_minutes, notes).catch(() => {});

  return NextResponse.json({ sessionId });
}

async function sendNotification(
  event: "proposed" | "confirmed",
  teacherId: string,
  studentId: string,
  scheduledAt: string,
  durationMinutes: number,
  notes?: string | null,
) {
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, timezone")
    .in("id", [teacherId, studentId]);

  const teacherProfile = profiles?.find((p) => p.id === teacherId);
  const studentProfile = profiles?.find((p) => p.id === studentId);

  const teacherName = teacherProfile?.full_name ?? "Teacher";
  const studentName = studentProfile?.full_name ?? "Student";

  const { data: authUser } = await admin.auth.admin.getUserById(teacherId);
  const recipientEmail = authUser?.user?.email;
  if (!recipientEmail) return;

  await sendSessionEmail({
    event,
    recipientEmail,
    recipientName: teacherName,
    actorName: studentName,
    scheduledAt,
    durationMinutes,
    notes,
    role: "teacher",
    recipientTimezone: teacherProfile?.timezone,
  });
}
