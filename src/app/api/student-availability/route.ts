import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getStudentAvailabilityBundle } from "@/lib/availability/data";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "student") {
    return NextResponse.json({ error: "Only students have student availability." }, { status: 403 });
  }

  const { rules, overrides, timezone } = await getStudentAvailabilityBundle(profile.id);
  return NextResponse.json({ rules, overrides, timezone });
}
