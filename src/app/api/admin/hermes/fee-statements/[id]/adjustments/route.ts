import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/auth/get-user-profile";
import { calculateFeeStatementBalance, loadFeeStatementAdjustments, sanitizeFeeStatementAdjustmentInput } from "@/lib/hermes/fee-statement-adjustments";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
async function activeAdmin() {
  const profile = await getUserProfile();
  return profile?.is_active && profile.role === "admin" ? profile : null;
}
async function snapshot(client: ReturnType<typeof createAdminClient>, id: string) {
  const { data: statement, error } = await client.from("academy_fee_statements").select("id,total_minor,status").eq("id", id).maybeSingle();
  if (error) throw new Error("statement_read_failed");
  if (!statement) return null;
  const adjustments = await loadFeeStatementAdjustments(client, id);
  return { adjustments, balance: calculateFeeStatementBalance(Number(statement.total_minor), adjustments) };
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await activeAdmin())) return json({ error: "Unauthorized" }, 403);
    const { id } = await context.params;
    if (!UUID.test(id)) return json({ error: "Invalid statement." }, 400);
    const result = await snapshot(createAdminClient(), id);
    return result ? json(result) : json({ error: "Statement not found." }, 404);
  } catch {
    return json({ error: "Could not retrieve statement adjustments." }, 500);
  }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const profile = await activeAdmin();
    if (!profile) return json({ error: "Unauthorized" }, 403);
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Unauthorized" }, 403);
    const { id } = await context.params;
    if (!UUID.test(id)) return json({ error: "Invalid statement." }, 400);
    let input;
    try { input = sanitizeFeeStatementAdjustmentInput(await request.json()); }
    catch { return json({ error: "Invalid adjustment." }, 400); }
    const client = createAdminClient();
    const { data: saved, error } = await client.rpc("add_academy_fee_statement_adjustment", {
      p_statement_id: id, p_kind: input.kind, p_label: input.label, p_amount_minor: input.amountMinor,
      p_reference: input.reference, p_expected_version: input.expectedVersion,
      p_client_request_id: input.clientRequestId, p_actor_profile_id: profile.id,
    });
    if (error) {
      const message = error.message ?? "";
      const conflicts: Array<[string, string]> = [
        ["stale_fee_statement_adjustments", "This invoice changed. Reload the balance before saving."],
        ["advance_exceeds_current_due", "Apply only the portion of the advance needed for this invoice."],
        ["client_request_payload_mismatch", "This request ID was already used for a different adjustment."],
        ["fee_statement_ineligible", "Paid or voided statements cannot receive adjustments."],
        ["fee_statement_adjustment_limit", "This invoice has reached its adjustment limit."],
        ["invalid_fee_statement_balance", "This adjustment exceeds the supported invoice balance."],
      ];
      if (error.code === "23505") return json({ code: "duplicate_adjustment_reference", error: "This receipt reference has already been applied. Do not record the payment twice." }, 409);
      const conflict = conflicts.find(([code]) => message.includes(code));
      if (conflict) return json({ code: conflict[0], error: conflict[1] }, 409);
      if (message.includes("ineligible_fee_statement_actor")) return json({ error: "Unauthorized" }, 403);
      if (message.includes("fee_statement_not_found")) return json({ error: "Statement not found." }, 404);
      if (message.includes("invalid_fee_statement_adjustment")) return json({ error: "Invalid adjustment." }, 400);
      return json({ error: "Adjustment could not be applied." }, 500);
    }
    const event = Array.isArray(saved) ? saved[0] : saved;
    const result = await snapshot(client, id);
    const verified = result?.adjustments.find((item) => item.id === event?.id);
    if (!verified || verified.kind !== input.kind || verified.label !== input.label || verified.amountMinor !== input.amountMinor) {
      return json({ error: "The saved adjustment could not be verified. Retry with the same request before changing any fields." }, 500);
    }
    return json(result);
  } catch {
    return json({ error: "Adjustment could not be applied. Retry with the same request before changing any fields." }, 500);
  }
}
