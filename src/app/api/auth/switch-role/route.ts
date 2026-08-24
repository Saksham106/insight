import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/get-user-profile";

const destinations: Record<UserRole, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
  parent: "/parent",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const role = (body as { role?: string }).role as UserRole | undefined;
  if (!role || !(role in destinations)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data: assignment, error } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", userData.user.id)
    .eq("role", role)
    .maybeSingle();

  if (error || !assignment) {
    return NextResponse.json({ error: "That workspace is not assigned to this account." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set("insight-active-role", role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ role, destination: destinations[role] });
}
