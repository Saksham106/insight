import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "student") {
    return NextResponse.json({ error: "Only students can set student availability." }, { status: 403 });
  }

  const body = await request.json();
  const { weekday, start_time, end_time, timezone } = body;

  if (typeof weekday !== "number" || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "weekday must be a number between 0 and 6." }, { status: 400 });
  }
  if (!start_time || !end_time || typeof start_time !== "string" || typeof end_time !== "string") {
    return NextResponse.json({ error: "start_time and end_time are required." }, { status: 400 });
  }
  if (!(end_time > start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
  }
  if (!timezone || typeof timezone !== "string") {
    return NextResponse.json({ error: "timezone is required." }, { status: 400 });
  }

  const rule_type = body.rule_type ?? "available";
  if (rule_type !== "available" && rule_type !== "blocked") {
    return NextResponse.json({ error: "rule_type must be 'available' or 'blocked'." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_availability_rules")
    .insert({ student_id: profile.id, weekday, start_time, end_time, timezone, rule_type })
    .select("id, student_id, weekday, start_time, end_time, timezone, is_active, rule_type")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}
