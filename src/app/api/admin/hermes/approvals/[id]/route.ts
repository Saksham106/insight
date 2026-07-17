import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/hermes/approvals/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !["approved", "rejected"].includes(body.decision)) return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("decide_hermes_approval_by_channel", {
    p_approval_id: id,
    p_code: null,
    p_decided_by: profile.id,
    p_decision: body.decision,
    p_external_id: `dashboard:${randomUUID()}`,
    p_channel: "dashboard",
  });
  if (error) return NextResponse.json({ error: "Could not record the decision." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Approval is no longer pending." }, { status: 409 });
  if (data.status === "approved" && data.settlement_cycle_id && !data.consumed_at) {
    const { error: finalizeError } = await supabase.rpc("finalize_academy_settlement", { p_approval_id: data.id });
    if (finalizeError) return NextResponse.json({ error: "Approval was saved, but the settlement could not be finalized." }, { status: 500 });
  }
  return NextResponse.json({ approval: { id: data.id, case_id: data.case_id, settlement_cycle_id: data.settlement_cycle_id, action: data.action, status: data.status } });
}
