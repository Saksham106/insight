import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { reminder_24h, reminder_3h } = body as { reminder_24h?: boolean; reminder_3h?: boolean };

  if (typeof reminder_24h !== "boolean" && typeof reminder_3h !== "boolean") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  if (typeof reminder_24h === "boolean") updates.reminder_24h = reminder_24h;
  if (typeof reminder_3h === "boolean") updates.reminder_3h = reminder_3h;

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(updates).eq("id", profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
