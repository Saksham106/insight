import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminConversation, getAllConversationsForAdmin } from "@/lib/chat/data";

// The admin's single conversations resource: every thread in the academy
// (groups and DMs alike), plus creation. Admin RLS already permits reading the
// messages themselves client-side.
export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const conversations = await getAllConversationsForAdmin();
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const memberIds: unknown = body?.memberIds;
  const title: unknown = body?.title;

  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "A conversation needs at least two people." }, { status: 400 });
  }

  const result = await createAdminConversation({
    creatorId: profile.id,
    memberIds: memberIds as string[],
    title: typeof title === "string" ? title : null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // `existing` tells the client no chat was created because these exact people
  // already have one, so it can say so rather than silently opening it.
  if (result.existing) {
    return NextResponse.json({ conversationId: result.conversationId, existing: true });
  }

  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
  return NextResponse.json({ conversationId: result.conversationId, existing: false });
}
