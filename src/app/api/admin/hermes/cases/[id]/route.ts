import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
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
  const { data, error } = await supabase.rpc("admin_close_hermes_scheduling_case", {
    p_case_id: id,
    p_reason: reason.slice(0, RECONCILIATION_REASON_LIMIT),
    p_actor_profile_id: profile.id,
  });
  if (error) {
    const stale = error.message?.includes("stale_case");
    return NextResponse.json(
      { error: stale ? "This case changed since you opened the page. Refresh and try again." : "Could not close the case." },
      { status: stale ? 409 : 500 },
    );
  }

  return NextResponse.json({ case: data });
}
