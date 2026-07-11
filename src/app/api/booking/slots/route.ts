import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  getAssignmentParticipants,
  getBusySessionsForParticipants,
  getTeacherAvailabilityBundle,
  getTeacherProfileTimezone,
  resolveTeacherTimeZone,
} from "@/lib/availability/data";
import { generateAvailabilitySlots } from "@/lib/availability/slot-engine";

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const assignmentId = searchParams.get("assignment_id");
  const durationParam = searchParams.get("duration_minutes");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!assignmentId) {
    return NextResponse.json({ error: "assignment_id is required." }, { status: 400 });
  }

  const from = fromParam ? new Date(fromParam) : new Date();
  const to = toParam ? new Date(toParam) : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid from/to range." }, { status: 400 });
  }

  const participants = await getAssignmentParticipants(assignmentId);
  if (!participants) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  if (profile.id !== participants.teacherId && profile.id !== participants.studentId) {
    return NextResponse.json({ error: "You do not have access to this assignment." }, { status: 403 });
  }

  const bundle = await getTeacherAvailabilityBundle(participants.teacherId);

  const profileTz = await getTeacherProfileTimezone(participants.teacherId);
  const teacherTimeZone = resolveTeacherTimeZone(bundle.settings, profileTz);

  const durationMinutes = durationParam ? Number(durationParam) : bundle.settings.default_duration_minutes;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "duration_minutes must be a positive number." }, { status: 400 });
  }

  const busySessions = await getBusySessionsForParticipants({
    teacherId: participants.teacherId,
    studentId: participants.studentId,
    from,
    to,
  });

  const slots = generateAvailabilitySlots({
    settings: bundle.settings,
    rules: bundle.rules,
    overrides: bundle.overrides,
    busySessions,
    durationMinutes,
    from,
    to,
    now: new Date(),
    teacherTimeZone,
  });

  return NextResponse.json({
    slots,
    timezone: teacherTimeZone,
    settings: {
      allowed_durations: bundle.settings.allowed_durations,
      default_duration_minutes: bundle.settings.default_duration_minutes,
      auto_confirm: bundle.settings.auto_confirm,
      slot_increment_minutes: bundle.settings.slot_increment_minutes,
    },
  });
}
