import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { getTeacherAvailabilityBundle } from "@/lib/availability/data";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view availability settings." }, { status: 403 });
  }

  const bundle = await getTeacherAvailabilityBundle(profile.id);

  return NextResponse.json(bundle);
}

export async function PUT(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can update availability settings." }, { status: 403 });
  }

  const body = await request.json();
  const {
    default_duration_minutes,
    allowed_durations,
    buffer_before_minutes,
    buffer_after_minutes,
    minimum_notice_hours,
    max_days_ahead,
    auto_confirm,
  } = body;

  const numericFields = {
    default_duration_minutes,
    buffer_before_minutes,
    buffer_after_minutes,
    minimum_notice_hours,
    max_days_ahead,
  };

  for (const [key, value] of Object.entries(numericFields)) {
    if (value === undefined || value === null || typeof value !== "number" || Number.isNaN(value)) {
      return NextResponse.json({ error: `Missing or invalid field: ${key}` }, { status: 400 });
    }
    if (value < 0) {
      return NextResponse.json({ error: `${key} must be non-negative.` }, { status: 400 });
    }
  }

  if (!Array.isArray(allowed_durations) || allowed_durations.length === 0 || !allowed_durations.every((d) => typeof d === "number" && d > 0)) {
    return NextResponse.json({ error: "allowed_durations must be a non-empty array of positive numbers." }, { status: 400 });
  }

  if (!allowed_durations.includes(default_duration_minutes)) {
    return NextResponse.json({ error: "default_duration_minutes must be included in allowed_durations." }, { status: 400 });
  }

  if (max_days_ahead < 1 || max_days_ahead > 180) {
    return NextResponse.json({ error: "max_days_ahead must be between 1 and 180." }, { status: 400 });
  }

  if (typeof auto_confirm !== "boolean") {
    return NextResponse.json({ error: "auto_confirm must be a boolean." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teacher_booking_settings")
    .upsert({
      teacher_id: profile.id,
      default_duration_minutes,
      allowed_durations,
      buffer_before_minutes,
      buffer_after_minutes,
      minimum_notice_hours,
      max_days_ahead,
      auto_confirm,
    })
    .select(
      "teacher_id, default_duration_minutes, allowed_durations, buffer_before_minutes, buffer_after_minutes, minimum_notice_hours, max_days_ahead, auto_confirm",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("dashboard", "max");

  return NextResponse.json({ settings: data });
}
