import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { notifyAssignmentBothParties } from "@/lib/email/session-notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin cancels an entire group class: every session sharing the group_session_id
// is marked cancelled and each pair is notified.
export async function DELETE(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { groupId } = await params;
  const admin = createAdminClient();

  const { data: sessions } = await admin
    .from("sessions")
    .select("id, assignment_id, scheduled_at, duration_minutes, notes, status")
    .eq("group_session_id", groupId);

  const active = (sessions ?? []).filter((s) => s.status !== "cancelled");
  if (active.length === 0) {
    return NextResponse.json({ cancelled: 0 });
  }

  const { error } = await admin
    .from("sessions")
    .update({ status: "cancelled", cancelled_by: profile.id })
    .eq("group_session_id", groupId)
    .neq("status", "cancelled");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("dashboard", "max");

  for (const s of active) {
    notifyAssignmentBothParties({
      event: "cancelled",
      assignmentId: s.assignment_id as string,
      scheduledAt: s.scheduled_at as string,
      durationMinutes: s.duration_minutes as number,
      notes: (s.notes as string | null) ?? null,
    }).catch((e) => console.error("[email] group session cancelled:", e));
  }

  return NextResponse.json({ cancelled: active.length });
}
