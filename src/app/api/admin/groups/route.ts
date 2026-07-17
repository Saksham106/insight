import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminGroup, getAllGroupsForAdmin } from "@/lib/chat/data";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const groups = await getAllGroupsForAdmin();
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const memberIds: unknown = body?.memberIds;
  const title: unknown = body?.title;

  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string") || memberIds.length === 0) {
    return NextResponse.json({ error: "Add at least one person to the group." }, { status: 400 });
  }

  const result = await createAdminGroup({
    creatorId: profile.id,
    memberIds: memberIds as string[],
    title: typeof title === "string" ? title : null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
  return NextResponse.json({ conversationId: result.conversationId });
}
