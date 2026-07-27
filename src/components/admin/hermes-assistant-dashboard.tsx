import Link from "next/link";
import { AlertCircle, Banknote, Bot, Clock3, MessageSquareText, Users } from "lucide-react";

import { HermesContactImport } from "@/components/admin/hermes-contact-import";
import { HermesContactQuickAdd } from "@/components/admin/hermes-contact-quick-add";
import { HermesApprovalActions } from "@/components/admin/hermes-approval-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface HermesContactIdentity {
  id: string;
  display_name: string;
  whatsapp_e164: string;
  role: string;
  profile_id: string | null;
  profile_link_status: string;
  communication_policy: string;
  consent_status: string;
  timezone: string | null;
  updated_at: string;
}

export interface HermesAdminContact extends HermesContactIdentity {
  conversation: {
    latestBody: string;
    latestSpeaker: "contact" | "kitty";
    latestAt: string;
    messageCount: number;
  } | null;
}

interface HermesAssistantDashboardProps {
  contacts: HermesAdminContact[];
  selectedContact: HermesContactIdentity | null;
  transcript: Array<{
    id: string;
    speaker: "contact" | "kitty";
    body: string;
    occurredAt: string;
  }>;
  transcriptError: string | null;
  cases: Array<{ id: string; title: string; status: string; human_takeover: boolean; updated_at: string }>;
  approvals: Array<{ id: string; action: string; status: string; requested_at: string; payload: unknown; proposal_version: number; case: unknown; settlement: unknown }>;
  messages: Array<{ id: string; direction: string; message_kind: string; status: string; occurred_at: string; contact: unknown }>;
  settlements: Array<{
    id: string;
    period_start: string;
    currency: string;
    status: string;
    updated_at: string;
    tutor_reports: Array<{ status: string }>;
    family_invoices: Array<{ status: string }>;
    tutor_payouts: Array<{ status: string }>;
  }>;
  loadError: string | null;
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function HermesAssistantDashboard({
  contacts,
  selectedContact,
  transcript,
  transcriptError,
  cases,
  approvals,
  messages,
  settlements,
  loadError,
}: HermesAssistantDashboardProps) {
  const attentionContacts = contacts.filter((contact) =>
    contact.role === "unclassified" || contact.profile_link_status === "suggested" || contact.communication_policy !== "direct",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <header>
        <h1 className="text-2xl font-semibold text-navy" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Bot size={24} /> Kitty
        </h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          Import academy contacts and review only the work that needs you.
        </p>
      </header>

      {loadError ? <p className="text-sm text-error">{loadError}</p> : null}
      <HermesContactQuickAdd />
      <HermesContactImport />

      <section className="form-grid-2" style={{ gap: "16px" }}>
        <Card style={{ gridColumn: "1 / -1" }}>
          <CardHeader>
            <CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Users size={18} /> WhatsApp conversations
            </CardTitle>
            <CardDescription>
              {contacts.length} contacts · Read-only message history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="form-grid-2" style={{ gap: "16px", alignItems: "stretch" }}>
              <div
                aria-label="WhatsApp contacts"
                style={{
                  maxHeight: "520px",
                  overflowY: "auto",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                }}
              >
                {contacts.length === 0 ? (
                  <div style={{ padding: "16px" }}>
                    <Empty>Upload an academy contact list to begin.</Empty>
                  </div>
                ) : contacts.map((contact) => {
                  const isSelected = selectedContact?.id === contact.id;
                  return (
                    <Link
                      key={contact.id}
                      href={`/admin/hermes?contact=${contact.id}`}
                      aria-current={isSelected ? "page" : undefined}
                      scroll={false}
                      style={{
                        display: "block",
                        padding: "12px 14px",
                        borderBottom: "1px solid var(--color-border)",
                        borderLeft: `3px solid ${isSelected ? "var(--color-navy)" : "transparent"}`,
                        background: isSelected ? "var(--color-soft)" : "transparent",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="text-sm font-semibold text-navy" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {contact.display_name}
                          </p>
                          <p className="text-xs text-muted">{contact.whatsapp_e164}</p>
                        </div>
                        <Badge>{contact.role}</Badge>
                      </div>
                      {contact.conversation ? (
                        <>
                          <p
                            className="text-sm"
                            style={{
                              marginTop: "8px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {contact.conversation.latestSpeaker === "kitty" ? "Kitty: " : ""}
                            {contact.conversation.latestBody}
                          </p>
                          <p className="text-xs text-muted" style={{ marginTop: "3px" }}>
                            {formatMessageTime(contact.conversation.latestAt)} · {contact.conversation.messageCount} {contact.conversation.messageCount === 1 ? "message" : "messages"}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted" style={{ marginTop: "8px" }}>
                          No WhatsApp messages yet
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>

              <div
                aria-live="polite"
                style={{
                  minHeight: "320px",
                  maxHeight: "520px",
                  overflowY: "auto",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  background: "var(--color-surface)",
                  padding: "16px",
                }}
              >
                {transcriptError ? (
                  <div style={{ display: "flex", gap: "8px", color: "var(--color-error)" }}>
                    <AlertCircle size={18} aria-hidden />
                    <p className="text-sm">Transcript temporarily unavailable.</p>
                  </div>
                ) : !selectedContact ? (
                  <div style={{ minHeight: "286px", display: "grid", placeItems: "center", textAlign: "center" }}>
                    <p className="text-sm text-muted">
                      Select a contact to view their WhatsApp conversation
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "12px" }}>
                      <p className="text-base font-semibold text-navy">
                        Conversation with {selectedContact.display_name}
                      </p>
                      <p className="text-xs text-muted">{selectedContact.whatsapp_e164}</p>
                    </div>
                    {transcript.length === 0 ? (
                      <Empty>No WhatsApp messages yet.</Empty>
                    ) : transcript.map((message) => {
                      const fromKitty = message.speaker === "kitty";
                      return (
                        <div
                          key={message.id}
                          style={{
                            alignSelf: fromKitty ? "flex-end" : "flex-start",
                            maxWidth: "82%",
                          }}
                        >
                          <p
                            className="text-xs font-semibold"
                            style={{
                              marginBottom: "4px",
                              textAlign: fromKitty ? "right" : "left",
                              color: "var(--color-muted)",
                            }}
                          >
                            {message.speaker === "kitty" ? (
                              <span>Kitty</span>
                            ) : (
                              <span>Contact</span>
                            )}
                          </p>
                          <div
                            style={{
                              borderRadius: "12px",
                              padding: "10px 12px",
                              background: fromKitty ? "var(--color-navy)" : "var(--color-soft)",
                              color: fromKitty ? "#ffffff" : "var(--color-foreground)",
                              overflowWrap: "anywhere",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            <p className="text-sm">{message.body}</p>
                          </div>
                          <time
                            className="text-xs text-muted"
                            dateTime={message.occurredAt}
                            style={{
                              display: "block",
                              marginTop: "4px",
                              textAlign: fromKitty ? "right" : "left",
                            }}
                          >
                            {formatMessageTime(message.occurredAt)}
                          </time>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><AlertCircle size={18} /> Needs attention</CardTitle><CardDescription>Matches, approvals, and exceptions</CardDescription></CardHeader>
          <CardContent>
            {attentionContacts.length === 0 && approvals.length === 0 ? <Empty>Nothing needs your attention.</Empty> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {approvals.map((approval) => <div key={approval.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "10px" }}><p className="text-sm font-semibold">Approval needed: {approval.action.replaceAll("_", " ")}</p><pre className="text-sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "6px 0" }}>{JSON.stringify(approval.payload, null, 2)}</pre><HermesApprovalActions approvalId={approval.id} /></div>)}
                {attentionContacts.map((contact) => <p key={contact.id} className="text-sm">Review {contact.display_name}: {contact.role === "unclassified" ? "choose a role" : contact.communication_policy.replaceAll("_", " ")}</p>)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><Clock3 size={18} /> Active scheduling</CardTitle><CardDescription>Who is waiting on whom</CardDescription></CardHeader>
          <CardContent>{cases.length === 0 ? <Empty>No active scheduling cases.</Empty> : cases.map((item) => <div key={item.id} style={{ marginBottom: "10px" }}><p className="text-sm font-semibold">{item.title}</p><p className="text-sm text-muted">{item.status.replaceAll("_", " ")}{item.human_takeover ? " · Swati takeover" : ""}</p></div>)}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><Banknote size={18} /> Monthly settlements</CardTitle><CardDescription>Tutor-reported work and payment tracking</CardDescription></CardHeader>
          <CardContent>{settlements.length === 0 ? <Empty>No monthly settlement cycles yet.</Empty> : settlements.map((cycle) => {
            const readyReports = cycle.tutor_reports.filter((item) => ["ready", "approved"].includes(item.status)).length;
            const paidInvoices = cycle.family_invoices.filter((item) => item.status === "paid").length;
            const paidPayouts = cycle.tutor_payouts.filter((item) => item.status === "paid").length;
            return <div key={cycle.id} style={{ marginBottom: "12px", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}><p className="text-sm font-semibold">{new Date(`${cycle.period_start}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p><Badge>{cycle.status.replaceAll("_", " ")}</Badge></div>
              <p className="text-sm text-muted">Tutor reports {readyReports}/{cycle.tutor_reports.length} · Family invoices {paidInvoices}/{cycle.family_invoices.length} paid · Tutor payouts {paidPayouts}/{cycle.tutor_payouts.length} paid</p>
            </div>;
          })}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><MessageSquareText size={18} /> Recent activity</CardTitle><CardDescription>Latest WhatsApp delivery state</CardDescription></CardHeader>
          <CardContent>{messages.length === 0 ? <Empty>No WhatsApp activity yet.</Empty> : messages.map((message) => <p key={message.id} className="text-sm" style={{ marginBottom: "8px" }}>{message.direction} {message.message_kind} · {message.status}</p>)}</CardContent>
        </Card>
      </section>
    </div>
  );
}
