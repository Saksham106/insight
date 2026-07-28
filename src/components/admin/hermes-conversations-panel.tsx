import Link from "next/link";
import { AlertCircle, ChevronLeft, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  PanelCard,
  formatMessageTime,
  hermesTabHref,
  type HermesAdminContact,
  type HermesContactIdentity,
  type HermesTranscriptMessage,
} from "@/components/admin/hermes-dashboard-shared";

interface HermesConversationsPanelProps {
  contacts: HermesAdminContact[];
  selectedContact: HermesContactIdentity | null;
  transcript: HermesTranscriptMessage[];
  transcriptError: string | null;
}

export function HermesConversationsPanel({
  contacts,
  selectedContact,
  transcript,
  transcriptError,
}: HermesConversationsPanelProps) {
  return (
    <PanelCard
      icon={<Users size={18} />}
      title="WhatsApp conversations"
      description={`${contacts.length} contacts · Read-only message history`}
    >
      {/* data-selected drives the mobile master/detail swap in globals.css —
          the list shows until a contact is picked, then the transcript. */}
      <div className="kitty-convo-grid" data-selected={selectedContact ? "true" : "false"}>
        <div aria-label="WhatsApp contacts" className="kitty-convo-list">
          {contacts.length === 0 ? (
            <div style={{ padding: "16px" }}>
              <Empty>Add a contact from the Contacts tab to begin.</Empty>
            </div>
          ) : contacts.map((contact) => {
            const isSelected = selectedContact?.id === contact.id;
            return (
              <Link
                key={contact.id}
                href={hermesTabHref("conversations", contact.id)}
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

        <div aria-live="polite" className="kitty-convo-detail">
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
                {/* Mobile-only: the list is hidden while a contact is open, so
                    this is the way back to it. Hidden on desktop, where both
                    panes are visible at once. */}
                <Link
                  href={hermesTabHref("conversations", null)}
                  scroll={false}
                  className="kitty-convo-back text-sm text-navy"
                  style={{ alignItems: "center", gap: "4px", marginBottom: "8px", textDecoration: "none" }}
                >
                  <ChevronLeft size={16} aria-hidden /> All contacts
                </Link>
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
    </PanelCard>
  );
}
