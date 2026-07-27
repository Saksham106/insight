import { AlertCircle, MessageSquareText } from "lucide-react";

import { HermesApprovalActions } from "@/components/admin/hermes-approval-actions";
import {
  Disclosure,
  Empty,
  PanelCard,
  formatMessageTime,
  type HermesAdminContact,
  type HermesApproval,
  type HermesMessage,
} from "@/components/admin/hermes-dashboard-shared";

interface HermesAttentionPanelProps {
  approvals: HermesApproval[];
  attentionContacts: HermesAdminContact[];
  messages: HermesMessage[];
}

export function HermesAttentionPanel({
  approvals,
  attentionContacts,
  messages,
}: HermesAttentionPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <PanelCard
        icon={<AlertCircle size={18} />}
        title="Needs attention"
        description="Matches, approvals, and exceptions"
        contentStyle={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {approvals.length === 0 && attentionContacts.length === 0 ? (
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

            {attentionContacts.length > 0 ? (
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 className="text-sm font-semibold text-navy">
                  Contacts to review ({attentionContacts.length})
                </h3>
                {attentionContacts.map((contact) => (
                  <p key={contact.id} className="text-sm">
                    Review {contact.display_name}: {contact.role === "unclassified" ? "choose a role" : contact.communication_policy.replaceAll("_", " ")}
                  </p>
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
          hint={messages.length === 0 ? "no activity yet" : `${messages.length} most recent`}
        >
          {messages.length === 0 ? (
            <Empty>No WhatsApp activity yet.</Empty>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
              {messages.map((message) => (
                <li
                  key={message.id}
                  className="text-sm"
                  style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "space-between" }}
                >
                  <span>{message.direction} {message.message_kind} · {message.status}</span>
                  <span className="text-xs text-muted">{formatMessageTime(message.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </PanelCard>
    </div>
  );
}
