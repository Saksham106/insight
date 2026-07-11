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
    return NextResponse.json({ error: "Only teachers can update availability rules." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { weekday, start_time, end_time, timezone, is_active } = body;

  if (weekday !== undefined && (typeof weekday !== "number" || weekday < 0 || weekday > 6)) {
    return NextResponse.json({ error: "weekday must be a number between 0 and 6." }, { status: 400 });
  }

  if ((start_time !== undefined && typeof start_time !== "string") || (end_time !== undefined && typeof end_time !== "string")) {
    return NextResponse.json({ error: "start_time and end_time must be strings." }, { status: 400 });
  }

  if (start_time !== undefined && end_time !== undefined && !(end_time > start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (weekday !== undefined) updatePayload.weekday = weekday;
  if (start_time !== undefined) updatePayload.start_time = start_time;
  if (end_time !== undefined) updatePayload.end_time = end_time;
  if (timezone !== undefined) updatePayload.timezone = timezone;
  if (is_active !== undefined) updatePayload.is_active = is_active;
  if (body.rule_type !== undefined) {
    if (body.rule_type !== "available" && body.rule_type !== "blocked") {
      return NextResponse.json({ error: "rule_type must be 'available' or 'blocked'." }, { status: 400 });
    }
    updatePayload.rule_type = body.rule_type;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teacher_availability_rules")
    .update(updatePayload)
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .select("id, teacher_id, weekday, start_time, end_time, timezone, is_active, rule_type")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Availability rule not found." }, { status: 404 });

  return NextResponse.json({ rule: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete availability rules." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teacher_availability_rules")
    .update({ is_active: false })
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Availability rule not found." }, { status: 404 });

  return NextResponse.json({ success: true });
}
