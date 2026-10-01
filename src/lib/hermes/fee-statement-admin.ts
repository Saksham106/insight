import { calculateFeeStatementBalance, projectFeeStatementAdjustment } from "./fee-statement-adjustments";

export function attachFeeStatementBalances<T extends { total_minor: number; adjustment_rows?: Record<string, unknown>[] }>(rows: T[]) {
  return rows.map(({ adjustment_rows, ...row }) => {
    const adjustments = (adjustment_rows ?? []).map(projectFeeStatementAdjustment);
    return { ...row, adjustments, balance: calculateFeeStatementBalance(Number(row.total_minor), adjustments) };
  });
}
