import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createConversation, getChattableContacts, getConversationsForUser } from "@/lib/chat/data";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversations = await getConversationsForUser(profile.id);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const memberIds: unknown = body?.memberIds;
  const title: unknown = body?.title;

  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string") || memberIds.length === 0) {
    return NextResponse.json({ error: "Select at least one person to chat with." }, { status: 400 });
  }

  const requested = [...new Set(memberIds as string[])].filter((id) => id !== profile.id);
  if (requested.length === 0) {
    return NextResponse.json({ error: "Select at least one person to chat with." }, { status: 400 });
  }

  // Validate every requested member is within the creator's allowed contact set.
  const allowed = new Set((await getChattableContacts(profile)).map((c) => c.id));
  const invalid = requested.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    return NextResponse.json({ error: "You can only start chats with your own contacts." }, { status: 403 });
  }

  const isGroup = requested.length > 1;
  const groupTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : null;

  const result = await createConversation({
    creatorId: profile.id,
    memberIds: requested,
    isGroup,
    title: groupTitle,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  revalidateTag("dashboard", "max");
  return NextResponse.json({ conversationId: result.conversationId });
}
