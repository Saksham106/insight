import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail } from "@/lib/email";

export async function POST(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // Windows: sessions starting between [now+23h, now+25h] for 24h reminder
  //          and between [now+2h, now+4h] for 3h reminder
  const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const window24hEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
  const window3hStart  = new Date(now.getTime() +  2 * 60 * 60 * 1000).toISOString();
  const window3hEnd    = new Date(now.getTime() +  4 * 60 * 60 * 1000).toISOString();

  // Fetch confirmed sessions in either window that haven't been sent yet
  const { data: sessions, error } = await admin
    .from("sessions")
    .select(`
      id,
      scheduled_at,
      duration_minutes,
      reminder_24h_sent_at,
      reminder_3h_sent_at,
      teacher:profiles!sessions_teacher_id_fkey(id, name, email, reminder_24h, reminder_3h, timezone),
      student:profiles!sessions_student_id_fkey(id, name, email, reminder_24h, reminder_3h, timezone)
    `)
    .eq("status", "confirmed")
    .or(
      `and(scheduled_at.gte.${window24hStart},scheduled_at.lte.${window24hEnd}),and(scheduled_at.gte.${window3hStart},scheduled_at.lte.${window3hEnd})`
    );

  if (error) {
    console.error("Cron reminders query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  const sessionIds24h: string[] = [];
  const sessionIds3h: string[] = [];

  for (const session of sessions ?? []) {
    const scheduledAt = session.scheduled_at as string;
    const sessionTime = new Date(scheduledAt).getTime();
    const diffH = (sessionTime - now.getTime()) / (1000 * 60 * 60);

    const is24h = diffH >= 23 && diffH < 25 && !session.reminder_24h_sent_at;
    const is3h  = diffH >= 2  && diffH < 4  && !session.reminder_3h_sent_at;

    type Profile = { id: string; name: string; email: string; reminder_24h: boolean; reminder_3h: boolean; timezone: string | null };
    // Supabase returns joins as arrays; grab first element
    const teacherArr = session.teacher as unknown as Profile[];
    const studentArr = session.student as unknown as Profile[];
    const teacher = Array.isArray(teacherArr) ? teacherArr[0] : (teacherArr as unknown as Profile | null);
    const student = Array.isArray(studentArr) ? studentArr[0] : (studentArr as unknown as Profile | null);

    if (!teacher || !student) continue;

    const parties: Array<{ email: string; name: string; other: string; role: "teacher" | "student"; tz: string | null; pref24h: boolean; pref3h: boolean }> = [
      { email: teacher.email, name: teacher.name, other: student.name, role: "teacher", tz: teacher.timezone, pref24h: teacher.reminder_24h, pref3h: teacher.reminder_3h },
      { email: student.email, name: student.name, other: teacher.name, role: "student", tz: student.timezone, pref24h: student.reminder_24h, pref3h: student.reminder_3h },
    ];

    for (const party of parties) {
      if (is24h && party.pref24h) {
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
      if (is3h && party.pref3h) {
        await sendReminderEmail({
          recipientEmail: party.email,
          recipientName: party.name,
          otherPartyName: party.other,
          scheduledAt,
          durationMinutes: session.duration_minutes as number,
          hoursUntil: 3,
          role: party.role,
          recipientTimezone: party.tz,
        }).catch(() => {});
        sent++;
      }
    }

    if (is24h) sessionIds24h.push(session.id as string);
    if (is3h)  sessionIds3h.push(session.id as string);
  }

  // Mark sessions as sent to avoid duplicates
  if (sessionIds24h.length > 0) {
    await admin
      .from("sessions")
      .update({ reminder_24h_sent_at: now.toISOString() })
      .in("id", sessionIds24h);
  }
  if (sessionIds3h.length > 0) {
    await admin
      .from("sessions")
      .update({ reminder_3h_sent_at: now.toISOString() })
      .in("id", sessionIds3h);
  }

  return NextResponse.json({ ok: true, sent });
}
