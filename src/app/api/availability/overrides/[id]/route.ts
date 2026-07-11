import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can update availability overrides." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { date, start_time, end_time, is_available } = body;

  const updatePayload: Record<string, unknown> = {};
  if (date !== undefined) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
    }
    updatePayload.date = date;
  }
  if (start_time !== undefined) updatePayload.start_time = start_time;
  if (end_time !== undefined) updatePayload.end_time = end_time;
  if (is_available !== undefined) {
    if (typeof is_available !== "boolean") {
      return NextResponse.json({ error: "is_available must be a boolean." }, { status: 400 });
    }
    updatePayload.is_available = is_available;
  }
  if (start_time !== undefined && end_time !== undefined && start_time !== null && end_time !== null && !(end_time > start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_availability_overrides")
    .update(updatePayload)
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .select("id, teacher_id, date, start_time, end_time, timezone, is_available, reason")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Availability override not found." }, { status: 404 });

  return NextResponse.json({ override: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete availability overrides." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teacher_availability_overrides")
    .delete()
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Availability override not found." }, { status: 404 });

  return NextResponse.json({ success: true });
}
