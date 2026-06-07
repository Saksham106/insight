import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";

export async function GET() {
  const profile = await getUserProfile();

  if (!profile || !profile.is_active) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    role: profile.role,
  });
}
