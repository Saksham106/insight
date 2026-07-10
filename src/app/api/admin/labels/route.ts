import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const profile = await getUserProfile();
  return profile && profile.role === "admin" ? profile : null;
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const name = body.name?.toString().trim();
  const color = typeof body.color === "string" && body.color.trim() ? body.color.trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Label name is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Reuse an existing label of the same name rather than erroring on the unique constraint.
  const { data: existing } = await supabase
    .from("labels")
    .select("id, name, color")
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ label: existing });
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ name, color })
    .select("id, name, color")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("admin-dashboard", "max");

  return NextResponse.json({ label: data });
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const labelId = body.labelId?.toString();

  if (!labelId) {
    return NextResponse.json({ error: "Missing label id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("labels").delete().eq("id", labelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("admin-dashboard", "max");

  return NextResponse.json({ success: true });
}
