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
  const { data, error } = await supabase.rpc("decide_hermes_approval", {
    p_approval_id: id,
    p_decided_by: profile.id,
    p_decision: body.decision,
    p_note: typeof body.note === "string" ? body.note : null,
  });
  if (error) return NextResponse.json({ error: "Could not record the decision." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Approval is no longer pending." }, { status: 409 });
  return NextResponse.json({ approval: { id: data.id, case_id: data.case_id, action: data.action, status: data.status } });
}
