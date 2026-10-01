import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateFeeStatementBalance, loadFeeStatementAdjustments } from "./fee-statement-adjustments";
import { projectPublicFeeStatement, statementTokenHash, type PublicFeeStatement } from "./fee-statements";

export async function loadPublicFeeStatement(token: string, client: SupabaseClient): Promise<PublicFeeStatement | null> {
  const tokenHash = statementTokenHash(token);
  const { data, error } = await client
    .from("academy_fee_statements")
    .select("id, statement_reference, status, student_name, billed_to_name, period_start, period_end, due_date, currency, total_minor, line_items, issued_at, paid_at")
    .eq("public_token_hash", tokenHash)
    .in("status", ["published", "paid"])
    .maybeSingle();

  if (error) throw new Error("fee_statement_unavailable");
  if (!data) return null;
  const statement = projectPublicFeeStatement(data as Record<string, unknown>);
  const adjustments = await loadFeeStatementAdjustments(client, statement.id);
  return adjustments.length
    ? { ...statement, adjustments, balance: calculateFeeStatementBalance(statement.totalMinor, adjustments) }
    : statement;
}
