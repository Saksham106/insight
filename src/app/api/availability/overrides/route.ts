import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can create availability overrides." }, { status: 403 });
  }

  const body = await request.json();
  const { date, start_time, end_time, timezone, is_available, reason } = body;

  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required." }, { status: 400 });
  }

  if (!timezone || typeof timezone !== "string") {
    return NextResponse.json({ error: "timezone is required." }, { status: 400 });
  }

  if (typeof is_available !== "boolean") {
    return NextResponse.json({ error: "is_available must be a boolean." }, { status: 400 });
  }

  if (is_available && (!start_time || !end_time)) {
    return NextResponse.json({ error: "start_time and end_time are required when is_available is true." }, { status: 400 });
  }

  if (is_available && !(end_time > start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
  }

  // When is_available is false, times are optional but must both be present or both be null
  if (!is_available) {
    const hasStartTime = start_time !== undefined && start_time !== null;
    const hasEndTime = end_time !== undefined && end_time !== null;

    // Both or neither must be provided
    if (hasStartTime !== hasEndTime) {
      return NextResponse.json(
        { error: "start_time and end_time must both be provided or both be null when is_available is false." },
        { status: 400 }
      );
    }

    // If both are provided, validate end_time > start_time
    if (hasStartTime && hasEndTime && !(end_time > start_time)) {
      return NextResponse.json({ error: "end_time must be after start_time." }, { status: 400 });
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teacher_availability_overrides")
    .insert({
      teacher_id: profile.id,
      date,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
      timezone,
      is_available,
      reason: reason ?? null,
    })
    .select("id, teacher_id, date, start_time, end_time, timezone, is_available, reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ override: data });
}
