import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getAllConversationsForAdmin } from "@/lib/chat/data";

// Read-only listing of every conversation (groups + DMs) for the admin Chats
// viewer. Admin RLS already permits reading the messages themselves client-side.
export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const conversations = await getAllConversationsForAdmin();
  return NextResponse.json({ conversations });
}
