import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { planCaseReconciliation } from "@/lib/hermes/case-reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  let body: { apply?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const casesResult = await supabase
    .from("hermes_scheduling_cases")
    .select("id, status, proposed_times, resolution, human_takeover")
    .eq("status", "collecting_availability")
    .limit(200);
  if (casesResult.error) return NextResponse.json({ error: "Could not review scheduling cases." }, { status: 500 });
  const cases = casesResult.data ?? [];
  const caseIds = cases.map((item) => item.id);
  const empty = { data: [], error: null };
  const [participants, auditEvents, messages, approvals] = caseIds.length
    ? await Promise.all([
        supabase.from("hermes_case_participants").select("case_id, response_status, availability").in("case_id", caseIds),
        supabase.from("hermes_audit_events").select("entity_id, event_type").eq("entity_type", "scheduling_case").in("entity_id", caseIds),
        supabase.from("hermes_messages").select("case_id, intent").in("case_id", caseIds),
        supabase.from("hermes_approvals").select("case_id, status").in("case_id", caseIds),
      ])
    : [empty, empty, empty, empty];
  if (participants.error || auditEvents.error || messages.error || approvals.error) {
    return NextResponse.json({ error: "Could not review scheduling evidence." }, { status: 500 });
  }
  const plan = planCaseReconciliation({
    cases,
    participants: participants.data ?? [],
    auditEvents: auditEvents.data ?? [],
    messages: messages.data ?? [],
    approvals: approvals.data ?? [],
  });
  if (body.apply !== true) return NextResponse.json({ applied: false, plan });

  const results = await Promise.all(plan.close.map(async (item) => {
    const result = await supabase.rpc("admin_reconcile_hermes_phantom_case", {
      p_case_id: item.id,
      p_actor_profile_id: profile.id,
    });
    return { id: item.id, closed: !result.error && result.data === true };
  }));
  return NextResponse.json({
    applied: true,
    plan,
    closed: results.filter((item) => item.closed).map((item) => item.id),
    skippedAfterRevalidation: results.filter((item) => !item.closed).map((item) => item.id),
  });
}
