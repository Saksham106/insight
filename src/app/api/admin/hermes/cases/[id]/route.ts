import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { canTransitionCase } from "@/lib/hermes/cases";
import { RECONCILIATION_REASON_LIMIT } from "@/lib/hermes/case-reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Closes an obsolete or duplicate scheduling case.
 *
 * Cancelling is the existing terminal state, so no new status is introduced.
 * The row is never deleted: participants, transcripts and audit history still
 * reference it. The transition is checked against the same table the assistant
 * uses, a bounded reason is stored, and the administrator who closed it is
 * named in the audit event.
 */
export async function PATCH(request: Request, context: RouteContext<"/api/admin/hermes/cases/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await context.params;

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Say why this case is being closed." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("hermes_scheduling_cases")
    .select("id, status, resolution")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: "Could not load the case." }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "That case no longer exists." }, { status: 404 });
  if (!canTransitionCase(existing.status, "cancelled")) {
    return NextResponse.json(
      { error: "This case has already been resolved. Refresh and try again." },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("hermes_scheduling_cases")
    .update({
      status: "cancelled",
      resolution: {
        outcome: "closed_by_admin",
        reason: reason.slice(0, RECONCILIATION_REASON_LIMIT),
        closedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    // Refuses to act on a case somebody else already moved.
    .eq("status", existing.status)
    .select("id, status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not close the case." }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "This case changed since you opened the page. Refresh and try again." },
      { status: 409 },
    );
  }

  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: "case_closed_by_admin",
    entity_type: "scheduling_case",
    entity_id: id,
    metadata: { reason: reason.slice(0, RECONCILIATION_REASON_LIMIT), previousStatus: existing.status },
  });

  return NextResponse.json({ case: data });
}
