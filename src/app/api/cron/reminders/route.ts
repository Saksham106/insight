import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail } from "@/lib/email";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // Wide window: 20–30h away, catches sessions at any time of the following day
  const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error } = await admin
    .from("sessions")
    .select(`
      id,
      scheduled_at,
      duration_minutes,
      reminder_24h_sent_at,
      teacher:profiles!sessions_teacher_id_fkey(id, name, email, reminder_24h, timezone),
      student:profiles!sessions_student_id_fkey(id, name, email, reminder_24h, timezone)
    `)
    .eq("status", "confirmed")
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd)
    .is("reminder_24h_sent_at", null);

  if (error) {
    console.error("Cron reminders query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  const sessionIds: string[] = [];

  for (const session of sessions ?? []) {
    const scheduledAt = session.scheduled_at as string;

    type Profile = { id: string; name: string; email: string; reminder_24h: boolean; timezone: string | null };
    const teacherArr = session.teacher as unknown as Profile[];
    const studentArr = session.student as unknown as Profile[];
    const teacher = Array.isArray(teacherArr) ? teacherArr[0] : (teacherArr as unknown as Profile | null);
    const student = Array.isArray(studentArr) ? studentArr[0] : (studentArr as unknown as Profile | null);

    if (!teacher || !student) continue;

    const parties: Array<{ email: string; name: string; other: string; role: "teacher" | "student"; tz: string | null; pref: boolean }> = [
      { email: teacher.email, name: teacher.name, other: student.name, role: "teacher", tz: teacher.timezone, pref: teacher.reminder_24h },
      { email: student.email, name: student.name, other: teacher.name, role: "student", tz: student.timezone, pref: student.reminder_24h },
    ];

    for (const party of parties) {
      if (!party.pref) continue;
      await sendReminderEmail({
        recipientEmail: party.email,
        recipientName: party.name,
        otherPartyName: party.other,
        scheduledAt,
        durationMinutes: session.duration_minutes as number,
        hoursUntil: 24,
        role: party.role,
        recipientTimezone: party.tz,
      }).catch(() => {});
      sent++;
    }

    sessionIds.push(session.id as string);
  }

  if (sessionIds.length > 0) {
    await admin
      .from("sessions")
      .update({ reminder_24h_sent_at: now.toISOString() })
      .in("id", sessionIds);
  }

  return NextResponse.json({ ok: true, sent });
}
