import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { archiveGroup, renameGroup, updateGroupMembers } from "@/lib/chat/data";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function revalidate() {
  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title: unknown = body?.title;
  const memberIds: unknown = body?.memberIds;

  if (typeof title === "string" || title === null) {
    const res = await renameGroup(id, (title as string | null) ?? null);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });
  }

  if (Array.isArray(memberIds)) {
    if (memberIds.some((m) => typeof m !== "string") || memberIds.length === 0) {
      return NextResponse.json({ error: "A group needs at least one person." }, { status: 400 });
    }
    const res = await updateGroupMembers(id, memberIds as string[]);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });
  }

  revalidate();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const res = await archiveGroup(id);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });

  revalidate();
  return NextResponse.json({ ok: true });
}
