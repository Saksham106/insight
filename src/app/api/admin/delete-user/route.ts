import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getUserProfile();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const userId = body.userId?.toString();

  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (userId === profile.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const supabase = await createClient();

  // Clearing is_active is what actually blocks sign-in; deleted_at only hides
  // the row from the admin lists. Both must be set together.
  const { data, error } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", userId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "User not found or already deleted." }, { status: 404 });
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ success: true });
}
