import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_student_assignments")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateDashboards();

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const isActive = Boolean(body.isActive);

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_student_assignments")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateDashboards();

  return NextResponse.json({ success: true });
}

function revalidateDashboards() {
  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
}
