import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import type { KittyEnrollmentInput } from "@/lib/hermes/kitty-class-enrollments";
import { deliverPendingKittyClassNotifications } from "@/lib/hermes/kitty-class-delivery";
import { addKittyClassEnrollment, editKittyClass, endKittyClassEnrollment, getKittyClassOccurrence, overrideKittyClass } from "@/lib/hermes/kitty-class-service";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

function enrollmentScope(value: unknown): "occurrence" | "this_and_future" {
  if (value === "occurrence" || value === "this_and_future") return value;
  throw new Error("invalid_scope");
}

async function context() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return null;
  if (process.env.KITTY_CLASS_CALENDAR_ENABLED !== "true") return "disabled" as const;
  return { profile, client: createAdminClient() };
}

export async function GET(_request: Request, route: Context) {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (auth === "disabled") return NextResponse.json({ error: "Kitty Classes is not enabled." }, { status: 503 });
  try {
    const { id } = await route.params;
    const item = await getKittyClassOccurrence(auth.client, { kind: "admin", profileId: auth.profile.id, channel: "dashboard" }, id);
    return NextResponse.json({ class: item });
  } catch {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }
}

export async function PATCH(request: Request, route: Context) {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (auth === "disabled") return NextResponse.json({ error: "Kitty Classes is not enabled." }, { status: 503 });
  const { id } = await route.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = { kind: "admin" as const, profileId: auth.profile.id, channel: "dashboard" as const };
    if (body.action === "add_enrollment") {
      if (!body.enrollment || typeof body.enrollment !== "object" || Array.isArray(body.enrollment)) throw new Error("invalid_action");
      const item = await addKittyClassEnrollment(auth.client, actor, {
        occurrenceId: id,
        version: Number(body.version),
        scope: enrollmentScope(body.scope),
        effectiveDate: String(body.effectiveDate ?? ""),
        enrollment: body.enrollment as KittyEnrollmentInput,
      });
      return NextResponse.json({ class: item });
    }
    if (body.action === "end_enrollment") {
      const item = await endKittyClassEnrollment(auth.client, actor, {
        occurrenceId: id,
        enrollmentId: String(body.enrollmentId ?? ""),
        version: Number(body.version),
        scope: enrollmentScope(body.scope),
        effectiveDate: String(body.effectiveDate ?? ""),
      });
      return NextResponse.json({ class: item });
    }
    if (body.action === "override") {
      const overrideReason = String(body.overrideReason ?? "").trim();
      const item = await overrideKittyClass(auth.client, actor, {
        occurrenceId: id,
        changeType: body.changeType === "reschedule" ? "reschedule" : "cancel",
        reason: overrideReason,
        startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
        endsAt: typeof body.endsAt === "string" ? body.endsAt : undefined,
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      });
      const notificationDelivery = await deliverPendingKittyClassNotifications(auth.client, request.url);
      return NextResponse.json({ class: item, notificationDelivery });
    }
    const scope = body.scope === "this_and_future" || body.scope === "entire_series" ? body.scope : "occurrence";
    const item = await editKittyClass(auth.client, actor, {
      id,
      version: Number(body.version),
      scope,
      title: typeof body.title === "string" ? body.title : undefined,
      subject: typeof body.subject === "string" || body.subject === null ? body.subject : undefined,
    });
    return NextResponse.json({ class: item });
  } catch (error) {
    const conflict = error instanceof Error && error.message === "stale_class";
    return NextResponse.json({ error: conflict ? "This class changed. Refresh and try again." : "Could not update the class." }, { status: conflict ? 409 : 400 });
  }
}
