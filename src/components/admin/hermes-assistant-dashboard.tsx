import { AlertCircle, Bot, Clock3, MessageSquareText, Users } from "lucide-react";

import { HermesContactImport } from "@/components/admin/hermes-contact-import";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface HermesAdminContact {
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

interface HermesAssistantDashboardProps {
  contacts: HermesAdminContact[];
  cases: Array<{ id: string; title: string; status: string; human_takeover: boolean; updated_at: string }>;
  approvals: Array<{ id: string; action: string; status: string; requested_at: string; case: unknown }>;
  messages: Array<{ id: string; direction: string; message_kind: string; status: string; occurred_at: string; contact: unknown }>;
  loadError: string | null;
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function HermesAssistantDashboard({ contacts, cases, approvals, messages, loadError }: HermesAssistantDashboardProps) {
  const attentionContacts = contacts.filter((contact) =>
    contact.role === "unclassified" || contact.profile_link_status === "suggested" || contact.communication_policy !== "direct",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <header>
        <h1 className="text-2xl font-semibold text-navy" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Bot size={24} /> Hermes Assistant
        </h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          Import academy contacts and review only the work that needs you.
        </p>
      </header>

      {loadError ? <p className="text-sm text-error">{loadError}</p> : null}
      <HermesContactImport />

      <section className="form-grid-2" style={{ gap: "16px" }}>
        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><Users size={18} /> Contacts</CardTitle><CardDescription>{contacts.length} WhatsApp contacts</CardDescription></CardHeader>
          <CardContent>
            {contacts.length === 0 ? <Empty>Upload an academy contact list to begin.</Empty> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {contacts.slice(0, 12).map((contact) => (
                  <div key={contact.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px" }}>
                    <div><p className="text-sm font-semibold">{contact.display_name}</p><p className="text-sm text-muted">{contact.whatsapp_e164}</p></div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><Badge>{contact.role}</Badge>{contact.profile_id ? <Badge variant="navy">Linked</Badge> : null}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><AlertCircle size={18} /> Needs attention</CardTitle><CardDescription>Matches, approvals, and exceptions</CardDescription></CardHeader>
          <CardContent>
            {attentionContacts.length === 0 && approvals.length === 0 ? <Empty>Nothing needs your attention.</Empty> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {approvals.map((approval) => <p key={approval.id} className="text-sm">Approval needed: {approval.action.replaceAll("_", " ")}</p>)}
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
          <CardHeader><CardTitle style={{ display: "flex", gap: "8px", alignItems: "center" }}><MessageSquareText size={18} /> Recent activity</CardTitle><CardDescription>Latest WhatsApp delivery state</CardDescription></CardHeader>
          <CardContent>{messages.length === 0 ? <Empty>No WhatsApp activity yet.</Empty> : messages.map((message) => <p key={message.id} className="text-sm" style={{ marginBottom: "8px" }}>{message.direction} {message.message_kind} · {message.status}</p>)}</CardContent>
        </Card>
      </section>
    </div>
  );
}
