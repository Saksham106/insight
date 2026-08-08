import { AlertCircle, MessageSquareText } from "lucide-react";

import { HermesApprovalActions } from "@/components/admin/hermes-approval-actions";
import {
  Disclosure,
  Empty,
  PanelCard,
  formatMessageTime,
  type HermesApproval,
  type HermesMessage,
} from "@/components/admin/hermes-dashboard-shared";
import type { AttentionItem } from "@/lib/hermes/attention";
import { projectDeliveryLog } from "@/lib/hermes/delivery-log";

interface HermesAttentionPanelProps {
  approvals: HermesApproval[];
  attentionItems: AttentionItem[];
  messages: HermesMessage[];
}

/** Where the action for an item is taken. */
const WHERE_LABELS: Record<string, string> = {
  attention: "here",
  contacts: "the Contacts tab",
  classes: "the Classes tab",
  scheduling: "the Scheduling tab",
  conversations: "the Conversations tab",
  ledger: "the Ledger tab",
};

export function HermesAttentionPanel({
  approvals,
  attentionItems,
  messages,
}: HermesAttentionPanelProps) {
  const deliveryRows = projectDeliveryLog(messages);
  // Approvals keep their own approve/reject controls, so they are rendered
  // separately from the items that only point at where the action lives.
  const otherItems = attentionItems.filter((item) => !item.id.startsWith("approval:"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <PanelCard
        icon={<AlertCircle size={18} />}
        title="Needs attention"
        description="Matches, approvals, and exceptions"
        contentStyle={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {attentionItems.length === 0 ? (
          <Empty>Nothing needs your attention.</Empty>
        ) : (
          <>
            {approvals.length > 0 ? (
              <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <h3 className="text-sm font-semibold text-navy">
                  Approvals waiting ({approvals.length})
                </h3>
                {approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="border border-border"
                    style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}
                  >
                    <p className="text-sm font-semibold">
                      Approval needed: {approval.action.replaceAll("_", " ")}
                    </p>
                    <Disclosure summary="View request details">
                      <pre
                        className="text-sm"
                        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}
                      >
                        {JSON.stringify(approval.payload, null, 2)}
                      </pre>
                    </Disclosure>
                    <HermesApprovalActions approvalId={approval.id} />
                  </div>
                ))}
              </section>
            ) : null}

            {otherItems.length > 0 ? (
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 className="text-sm font-semibold text-navy">
                  Needs a decision ({otherItems.length})
                </h3>
                {otherItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border"
                    style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px" }}
                  >
                    <p className="text-sm font-semibold text-navy">{item.who}</p>
                    <p className="text-sm">{item.whatHappened}</p>
                    <p className="text-sm text-muted">
                      {item.whatToDo}{" "}
                      <span className="text-xs">
                        (in {WHERE_LABELS[item.where] ?? "the Kitty dashboard"})
                      </span>
                    </p>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        )}
      </PanelCard>

      <PanelCard
        icon={<MessageSquareText size={18} />}
        title="Recent activity"
        description="Latest WhatsApp delivery state"
      >
        <Disclosure
          summary="Delivery log"
          hint={deliveryRows.length === 0 ? "no activity yet" : `${deliveryRows.length} most recent`}
        >
          {deliveryRows.length === 0 ? (
            <Empty>No WhatsApp activity yet.</Empty>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {deliveryRows.map((row) => (
                <li
                  key={row.id}
                  style={{ display: "flex", flexDirection: "column", gap: "2px" }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "space-between" }}>
                    <span className="text-sm font-semibold text-navy">{row.who}</span>
                    <span className="text-xs text-muted">{formatMessageTime(row.occurredAt)}</span>
                  </div>
                  <span className={row.failed ? "text-sm text-error" : "text-sm text-muted"}>
                    {[row.kind, row.status].filter(Boolean).join(" · ")}
                    {row.failed && row.errorCode ? ` (${row.errorCode})` : ""}
                  </span>
                  {row.preview ? (
                    <span
                      className="text-xs text-muted"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {row.preview}
                    </span>
                  ) : null}
                  {row.failed ? (
                    <span className="text-xs text-muted">
                      Listed above under failed deliveries.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </PanelCard>
    </div>
  );
}
