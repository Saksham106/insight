import { createAdminClient } from "@/lib/supabase/admin";

import type {
  AvailabilityOverride,
  AvailabilityRule,
  BookingSettings,
  BusySession,
  DateAvailabilityOverride,
  WeeklyAvailabilityRule,
} from "./types";

const DEFAULT_SETTINGS: Omit<BookingSettings, "teacher_id"> = {
  default_duration_minutes: 60,
  allowed_durations: [30, 45, 60, 90, 120],
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_hours: 12,
  max_days_ahead: 30,
  auto_confirm: true,
  availability_mode: "restricted",
  open_day_start: "08:00",
  open_day_end: "20:00",
  timezone: null,
  slot_increment_minutes: 30,
};

export async function getTeacherAvailabilityBundle(teacherId: string): Promise<{
  settings: BookingSettings;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
}> {
  const admin = createAdminClient();

  const [{ data: settingsRow }, { data: rulesRows }, { data: overridesRows }] = await Promise.all([
    admin
      .from("teacher_booking_settings")
      .select(
        "teacher_id, default_duration_minutes, allowed_durations, buffer_before_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead, auto_confirm, availability_mode, open_day_start, open_day_end, timezone, slot_increment_minutes",
      )
      .eq("teacher_id", teacherId)
      .maybeSingle(),
    admin
      .from("teacher_availability_rules")
      .select("id, teacher_id, weekday, start_time, end_time, timezone, is_active, rule_type")
      .eq("teacher_id", teacherId)
      .eq("is_active", true),
    admin
      .from("teacher_availability_overrides")
      .select("id, teacher_id, date, start_time, end_time, timezone, is_available, reason")
      .eq("teacher_id", teacherId),
  ]);

  const settings: BookingSettings = settingsRow
    ? (settingsRow as BookingSettings)
    : { teacher_id: teacherId, ...DEFAULT_SETTINGS };

  return {
    settings,
    rules: (rulesRows ?? []) as AvailabilityRule[],
    overrides: (overridesRows ?? []) as AvailabilityOverride[],
  };
}

// Student-owned availability. A student with no rows here is unrestricted, so
// callers must check `studentHasAvailability` before applying it as a filter.
export async function getStudentAvailabilityBundle(studentId: string): Promise<{
  rules: WeeklyAvailabilityRule[];
  overrides: DateAvailabilityOverride[];
  timezone: string;
}> {
  const admin = createAdminClient();

  const [{ data: profileRow }, { data: rulesRows }, { data: overridesRows }] = await Promise.all([
    admin.from("profiles").select("timezone").eq("id", studentId).maybeSingle(),
    admin
      .from("student_availability_rules")
      .select("id, weekday, start_time, end_time, timezone, is_active, rule_type")
      .eq("student_id", studentId)
      .eq("is_active", true),
    admin
      .from("student_availability_overrides")
      .select("id, date, start_time, end_time, timezone, is_available, reason")
      .eq("student_id", studentId),
  ]);

  const rules = (rulesRows ?? []) as WeeklyAvailabilityRule[];
  const overrides = (overridesRows ?? []) as DateAvailabilityOverride[];
  const profileTz = (profileRow as { timezone: string | null } | null)?.timezone ?? null;
  const timezone = profileTz ?? rules[0]?.timezone ?? overrides[0]?.timezone ?? "UTC";

  return { rules, overrides, timezone };
}

export async function getAssignmentParticipants(assignmentId: string): Promise<{
  assignmentId: string;
  teacherId: string;
  studentId: string;
} | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, student_id")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  return {
    assignmentId: data.id as string,
    teacherId: data.teacher_id as string,
    studentId: data.student_id as string,
  };
}

export async function getBusySessionsForParticipants(params: {
  teacherId: string;
  studentId: string;
  from: Date;
  to: Date;
}): Promise<BusySession[]> {
  const admin = createAdminClient();

  // Widen the query window so sessions that start just before `from` (or end
  // just after `to`) but still overlap the requested range aren't missed.
  const queryFrom = new Date(params.from.getTime() - 24 * 60 * 60 * 1000);
  const queryTo = new Date(params.to.getTime() + 24 * 60 * 60 * 1000);

  const { data } = await admin
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, status, assignment_id, assignment:assignment_id (teacher_id, student_id)")
    .neq("status", "cancelled")
    .gte("scheduled_at", queryFrom.toISOString())
    .lte("scheduled_at", queryTo.toISOString());

  if (!data) return [];

  return data
    .filter((session) => {
      const assignment = Array.isArray(session.assignment) ? session.assignment[0] : session.assignment;
      const teacherId = (assignment as { teacher_id?: string } | null)?.teacher_id;
      const studentId = (assignment as { student_id?: string } | null)?.student_id;
      return teacherId === params.teacherId || studentId === params.studentId;
    })
    .map((session) => ({
      id: session.id as string,
      scheduled_at: session.scheduled_at as string,
      duration_minutes: session.duration_minutes as number,
    }));
}

export function resolveTeacherTimeZone(
  settings: BookingSettings,
  profileTimezone: string | null,
): string {
  return settings.timezone ?? profileTimezone ?? "UTC";
}

export async function getTeacherProfileTimezone(teacherId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", teacherId)
    .single();
  return (data as { timezone: string | null } | null)?.timezone ?? null;
}
