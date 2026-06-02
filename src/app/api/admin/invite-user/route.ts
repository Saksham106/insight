import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const profile = await getUserProfile();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.toString().trim();
  const fullName = body.fullName?.toString().trim();
  const role = body.role?.toString().trim();

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!['teacher', 'student', 'admin'].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Invite failed" }, { status: 500 });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    role,
    is_active: true,
  });

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ userId: data.user.id });
}
