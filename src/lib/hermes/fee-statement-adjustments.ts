import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX = 1_000_000_000_000;
export type FeeStatementAdjustment = { id: string; kind: "extra_fee" | "advance"; label: string; amountMinor: number; createdAt: string };
export type FeeStatementBalance = { baseMinor: number; extraFeesMinor: number; advancesMinor: number; grossMinor: number; amountDueMinor: number; version: number };
export type FeeStatementAdjustmentInput = { kind: "extra_fee" | "advance"; label: string; amountMinor: number; reference: string; expectedVersion: number; clientRequestId: string };
function fail(): never { throw new Error("invalid_adjustment_input"); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return fail(); return value as Record<string, unknown>; }
export function sanitizeFeeStatementAdjustmentInput(input: unknown): FeeStatementAdjustmentInput {
  const v = record(input); const allowed = ["kind", "label", "amountMinor", "reference", "expectedVersion", "clientRequestId"];
  if (Object.keys(v).length !== allowed.length || Object.keys(v).some((k) => !allowed.includes(k))) return fail();
  if (v.kind !== "extra_fee" && v.kind !== "advance") return fail();
  if (typeof v.label !== "string" || !v.label.trim() || v.label.trim().length > 120 || /[\r\n]/.test(v.label)) return fail();
  if (typeof v.reference !== "string" || !v.reference.trim() || v.reference.trim().length > 500 || /[\r\n]/.test(v.reference)) return fail();
  if (!Number.isSafeInteger(v.amountMinor) || Number(v.amountMinor) <= 0 || Number(v.amountMinor) > MAX) return fail();
  if (!Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion) < 0 || Number(v.expectedVersion) > 100) return fail();
  if (typeof v.clientRequestId !== "string" || !UUID.test(v.clientRequestId)) return fail();
  return { kind: v.kind, label: v.label.trim().replace(/\s+/g, " "), amountMinor: Number(v.amountMinor), reference: v.reference.trim().replace(/\s+/g, " "), expectedVersion: Number(v.expectedVersion), clientRequestId: v.clientRequestId };
}
export function calculateFeeStatementBalance(baseMinor: number, adjustments: Array<{ kind: string; amountMinor: number }>): FeeStatementBalance {
  if (!Number.isSafeInteger(baseMinor) || baseMinor < 0 || baseMinor > MAX || !Array.isArray(adjustments) || adjustments.length > 100) throw new Error("invalid_fee_statement_balance");
  let extraFeesMinor = 0, advancesMinor = 0;
  for (const a of adjustments) {
    if (!a || !Number.isSafeInteger(a.amountMinor) || a.amountMinor <= 0 || a.amountMinor > MAX || (a.kind !== "advance" && a.kind !== "extra_fee")) throw new Error("invalid_fee_statement_balance");
    if (a.kind === "advance") advancesMinor += a.amountMinor; else extraFeesMinor += a.amountMinor;
  }
  const grossMinor = baseMinor + extraFeesMinor, amountDueMinor = grossMinor - advancesMinor;
  if (![extraFeesMinor, advancesMinor, grossMinor, amountDueMinor].every(Number.isSafeInteger) || grossMinor > MAX || amountDueMinor < 0) throw new Error("invalid_fee_statement_balance");
  return { baseMinor, extraFeesMinor, advancesMinor, grossMinor, amountDueMinor, version: adjustments.length };
}
export function projectFeeStatementAdjustment(row: Record<string, unknown>): FeeStatementAdjustment {
  if (typeof row.id !== "string" || !row.id || (row.kind !== "extra_fee" && row.kind !== "advance")
    || typeof row.label !== "string" || !row.label.trim() || row.label.length > 120
    || !Number.isSafeInteger(Number(row.amount_minor)) || Number(row.amount_minor) <= 0 || Number(row.amount_minor) > MAX
    || typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at))) {
    throw new Error("invalid_fee_statement_adjustment");
  }
  return { id: row.id, kind: row.kind, label: row.label, amountMinor: Number(row.amount_minor), createdAt: row.created_at };
}
export async function loadFeeStatementAdjustments(client: SupabaseClient, statementId: string): Promise<FeeStatementAdjustment[]> {
  const { data, error } = await client.from("academy_fee_statement_adjustments").select("id,kind,label,amount_minor,created_at").eq("statement_id", statementId).order("created_at", { ascending: true }).limit(101);
  if (error) throw new Error("fee_statement_adjustments_unavailable");
  if ((data ?? []).length > 100) throw new Error("fee_statement_adjustment_limit");
  return (data ?? []).map(projectFeeStatementAdjustment);
}
