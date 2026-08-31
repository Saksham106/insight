import { ReceiptText } from "lucide-react";

import { formatMinorCurrency } from "@/lib/format-minor-currency";

import { Empty, PanelCard, type HermesFeeStatementSummary } from "./hermes-dashboard-shared";

export function HermesFeeStatementsPanel({ statements }: { statements: HermesFeeStatementSummary[] }) {
  return (
    <PanelCard
      icon={<ReceiptText size={18} />}
      title="Fee statements"
      description="Published links created by Kitty. The private link itself is returned only when it is created."
    >
      {statements.length === 0 ? <Empty>No fee statements have been published yet.</Empty> : (
        <div style={{ display: "grid", gap: "10px" }}>
          {statements.map((statement) => (
            <article key={statement.id} className="border border-border bg-surface" style={{ borderRadius: "10px", padding: "14px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "8px 16px" }}>
              <div>
                <strong className="text-navy">{statement.student_name}</strong>
                <p className="text-xs text-muted" style={{ marginTop: "3px" }}>{statement.statement_reference} · {statement.period_start} to {statement.period_end}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong className="text-navy">{formatMinorCurrency(statement.total_minor, statement.currency)}</strong>
                <p className="text-xs text-muted" style={{ marginTop: "3px", textTransform: "capitalize" }}>{statement.status}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
