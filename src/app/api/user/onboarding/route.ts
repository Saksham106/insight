import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const event = body && typeof body === "object"
    ? (body as { event?: unknown }).event?.toString()
    : null;

  if (event !== "invite_accepted" && event !== "password_set") {
    return NextResponse.json({ error: "Invalid onboarding event" }, { status: 400 });
  }

  const admin = createAdminClient();
  const timestamp = new Date().toISOString();

  const update = event === "invite_accepted"
    ? { invite_accepted_at: timestamp }
    : { password_set_at: timestamp };

  let query = admin
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (event === "invite_accepted") {
    query = query.is("invite_accepted_at", null);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ ok: true });
}
