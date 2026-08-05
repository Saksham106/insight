import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { kittyLocalDateTimeToUtc } from "@/lib/hermes/kitty-classes";
import { createKittyClass, listKittyClasses, retryKittyClassNotification, type KittyClassParticipantInput } from "@/lib/hermes/kitty-class-service";
import { createAdminClient } from "@/lib/supabase/admin";

function enabled() {
  return process.env.KITTY_CLASS_CALENDAR_ENABLED === "true";
}

async function administrator() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return null;
  return profile;
}

export async function GET(request: Request) {
  const profile = await administrator();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!enabled()) return NextResponse.json({ error: "Kitty Classes is not enabled." }, { status: 503 });
  const view = new URL(request.url).searchParams.get("view");
  const safeView = view === "attention" || view === "history" ? view : "upcoming";
  try {
    const classes = await listKittyClasses(createAdminClient(), { kind: "admin", profileId: profile.id, channel: "dashboard" }, { view: safeView });
    return NextResponse.json({ classes });
  } catch {
    return NextResponse.json({ error: "Could not load Kitty classes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const profile = await administrator();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!enabled()) return NextResponse.json({ error: "Kitty Classes is not enabled." }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const participants = Array.isArray(body.participants) ? body.participants as KittyClassParticipantInput[] : [];
    const timezone = String(body.timezone ?? "");
    const localStartsAt = typeof body.localStartsAt === "string" ? body.localStartsAt : null;
    const startsAt = localStartsAt ? kittyLocalDateTimeToUtc(localStartsAt, timezone) : typeof body.startsAt === "string" ? body.startsAt : undefined;
    const durationMinutes = typeof body.durationMinutes === "number" ? body.durationMinutes : undefined;
    const endsAt = startsAt && durationMinutes ? new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString() : typeof body.endsAt === "string" ? body.endsAt : undefined;
    const created = await createKittyClass(createAdminClient(), { kind: "admin", profileId: profile.id, channel: "dashboard" }, {
      kind: body.kind === "weekly" ? "weekly" : "one_off",
      title: String(body.title ?? ""),
      subject: typeof body.subject === "string" ? body.subject : null,
      timezone,
      startsAt,
      endsAt,
      localDate: typeof body.localDate === "string" ? body.localDate : undefined,
      recurrence: body.recurrence,
      durationMinutes,
      effectiveStart: typeof body.effectiveStart === "string" ? body.effectiveStart : undefined,
      effectiveEnd: typeof body.effectiveEnd === "string" ? body.effectiveEnd : null,
      participants,
    });
    return NextResponse.json({ class: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && ["invalid_class", "invalid_recurrence"].includes(error.message)
      ? "Check the class time and participants."
      : "Could not create the Kitty class.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const profile = await administrator();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!enabled()) return NextResponse.json({ error: "Kitty Classes is not enabled." }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "retry_notification" || typeof body.notificationId !== "string") throw new Error("invalid_action");
    const notification = await retryKittyClassNotification(createAdminClient(), { kind: "admin", profileId: profile.id, channel: "dashboard" }, body.notificationId);
    return NextResponse.json({ notification });
  } catch {
    return NextResponse.json({ error: "This notification could not be retried." }, { status: 400 });
  }
}
