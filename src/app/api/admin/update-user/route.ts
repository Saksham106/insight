import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Idempotently reconcile a set of parent_student_links so that the links from
// `ownId` (via `ownCol`) point at exactly `desiredIds` (via `otherCol`).
async function syncLinks(
  supabase: AdminClient,
  ownCol: "parent_id" | "student_id",
  ownId: string,
  otherCol: "parent_id" | "student_id",
  desiredIds: string[],
) {
  const { data: existing, error: readError } = await supabase
    .from("parent_student_links")
    .select(otherCol)
    .eq(ownCol, ownId);
  if (readError) return readError.message;

  const existingIds = new Set(((existing ?? []) as Record<string, string>[]).map((row) => row[otherCol]));
  const desired = new Set(desiredIds);
  const toRemove = [...existingIds].filter((id) => !desired.has(id));
  const toAdd = desiredIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("parent_student_links")
      .delete()
      .eq(ownCol, ownId)
      .in(otherCol, toRemove);
    if (error) return error.message;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("parent_student_links")
      .insert(toAdd.map((id) => ({ [ownCol]: ownId, [otherCol]: id })));
    if (error) return error.message;
  }

  return null;
}

export async function POST(request: Request) {
  const profile = await getUserProfile();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const userId = body.userId?.toString();
  const role = body.role?.toString();

  if (!userId || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Full name — editable for every role.
  if (typeof body.fullName === "string") {
    const fullName = body.fullName.trim();
    if (!fullName) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Teacher labels — reconcile teacher_labels to exactly the provided ids.
  if (role === "teacher" && Array.isArray(body.labelIds)) {
    const labelIds: string[] = body.labelIds.map(String);
    const { data: existing, error: readError } = await supabase
      .from("teacher_labels")
      .select("label_id")
      .eq("teacher_id", userId);
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const existingIds = new Set(((existing ?? []) as { label_id: string }[]).map((row) => row.label_id));
    const desired = new Set(labelIds);
    const toRemove = [...existingIds].filter((id) => !desired.has(id));
    const toAdd = labelIds.filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("teacher_labels")
        .delete()
        .eq("teacher_id", userId)
        .in("label_id", toRemove);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("teacher_labels")
        .insert(toAdd.map((label_id) => ({ teacher_id: userId, label_id })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Parent → linked children.
  if (role === "parent" && Array.isArray(body.studentIds)) {
    const error = await syncLinks(supabase, "parent_id", userId, "student_id", body.studentIds.map(String));
    if (error) return NextResponse.json({ error }, { status: 500 });
  }

  // Student → linked parents (inverse of the above).
  if (role === "student" && Array.isArray(body.parentIds)) {
    const error = await syncLinks(supabase, "student_id", userId, "parent_id", body.parentIds.map(String));
    if (error) return NextResponse.json({ error }, { status: 500 });
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ success: true });
}
