import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { reminder_24h, notify_chat_messages, notify_session_changes } = body as {
    reminder_24h?: boolean;
    notify_chat_messages?: boolean;
    notify_session_changes?: boolean;
  };

  if (typeof reminder_24h !== "boolean" && typeof notify_chat_messages !== "boolean" && typeof notify_session_changes !== "boolean") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  if (typeof reminder_24h === "boolean") updates.reminder_24h = reminder_24h;
  if (typeof notify_chat_messages === "boolean") updates.notify_chat_messages = notify_chat_messages;
  if (typeof notify_session_changes === "boolean") updates.notify_session_changes = notify_session_changes;

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(updates).eq("id", profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
