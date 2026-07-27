import { Banknote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  PanelCard,
  type HermesSettlementCycle,
} from "@/components/admin/hermes-dashboard-shared";

function formatCycleMonth(periodStart: string) {
  return new Date(`${periodStart}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function ProgressRow({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold">{done}/{total}</span>
    </div>
  );
}

export function HermesSettlementsPanel({ settlements }: { settlements: HermesSettlementCycle[] }) {
  return (
    <PanelCard
      icon={<Banknote size={18} />}
      title="Monthly settlements"
      description="Tutor-reported work and payment tracking"
    >
      {settlements.length === 0 ? (
        <Empty>No monthly settlement cycles yet.</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {settlements.map((cycle, index) => {
            const readyReports = cycle.tutor_reports.filter((item) => ["ready", "approved"].includes(item.status)).length;
            const paidInvoices = cycle.family_invoices.filter((item) => item.status === "paid").length;
            const paidPayouts = cycle.tutor_payouts.filter((item) => item.status === "paid").length;
            return (
              <details
                key={cycle.id}
                open={index === 0}
                className="border border-border bg-surface"
                style={{ borderRadius: "10px", padding: "12px 14px" }}
              >
                <summary style={{ cursor: "pointer" }}>
                  <span
                    style={{ display: "inline-flex", width: "calc(100% - 24px)", justifyContent: "space-between", gap: "8px", alignItems: "center", verticalAlign: "middle" }}
                  >
                    <span className="text-sm font-semibold text-navy">{formatCycleMonth(cycle.period_start)}</span>
                    <Badge>{cycle.status.replaceAll("_", " ")}</Badge>
                  </span>
                </summary>
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <ProgressRow label="Tutor reports ready" done={readyReports} total={cycle.tutor_reports.length} />
                  <ProgressRow label="Family invoices paid" done={paidInvoices} total={cycle.family_invoices.length} />
                  <ProgressRow label="Tutor payouts paid" done={paidPayouts} total={cycle.tutor_payouts.length} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
