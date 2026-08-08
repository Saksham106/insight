import Link from "next/link";
import { AlertCircle, ChevronLeft, Users } from "lucide-react";

import { HermesConversationList } from "@/components/admin/hermes-conversation-list";
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
        <HermesConversationList
          contacts={contacts}
          selectedContactId={selectedContact?.id ?? null}
          selectedContactName={selectedContact?.display_name ?? null}
        />

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
