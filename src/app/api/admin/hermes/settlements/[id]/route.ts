import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: RouteContext<"/api/admin/hermes/settlements/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!UUID_PATTERN.test(id) || !body || !UUID_PATTERN.test(body.recordId ?? "")) {
    return NextResponse.json({ error: "A valid settlement record is required." }, { status: 400 });
  }

  const operation = body.action === "record_family_payment"
    ? { table: "academy_family_invoices", rpc: "record_academy_family_payment", argument: "p_invoice_id" }
    : body.action === "record_tutor_payout"
      ? { table: "academy_tutor_payouts", rpc: "record_academy_tutor_payout", argument: "p_payout_id" }
      : null;
  if (!operation) return NextResponse.json({ error: "Unsupported settlement action." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: record, error: lookupError } = await supabase
    .from(operation.table)
    .select("id, settlement_cycle_id")
    .eq("id", body.recordId)
    .eq("settlement_cycle_id", id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Could not check the settlement record." }, { status: 500 });
  if (!record) return NextResponse.json({ error: "Settlement record not found." }, { status: 404 });

  const { data, error } = await supabase.rpc(operation.rpc, { [operation.argument]: body.recordId });
  if (error) return NextResponse.json({ error: "Could not update the settlement record." }, { status: 409 });
  return NextResponse.json({ record: data });
}
