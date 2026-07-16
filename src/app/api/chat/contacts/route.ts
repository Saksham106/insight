import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getChattableContacts } from "@/lib/chat/data";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await getChattableContacts(profile);
  return NextResponse.json({ contacts });
}
