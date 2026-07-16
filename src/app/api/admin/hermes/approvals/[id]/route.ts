import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/hermes/approvals/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !["approved", "rejected"].includes(body.decision)) return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("hermes_approvals").update({
    status: body.decision,
    decided_by: profile.id,
    decided_at: new Date().toISOString(),
    decision_note: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null,
  }).eq("id", id).eq("status", "pending").select("id, case_id, action, status").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not record the decision." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Approval is no longer pending." }, { status: 409 });
  await supabase.from("hermes_audit_events").insert({ actor_type: "admin", actor_profile_id: profile.id, event_type: `approval_${body.decision}`, entity_type: "scheduling_case", entity_id: data.case_id, metadata: { approvalId: data.id, action: data.action } });
  return NextResponse.json({ approval: data });
}
