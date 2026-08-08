"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  formatMessageTime,
  hermesTabHref,
  type HermesAdminContact,
} from "@/components/admin/hermes-dashboard-shared";
import { filterConversationContacts } from "@/lib/hermes/conversation-search";

interface HermesConversationListProps {
  contacts: HermesAdminContact[];
  selectedContactId: string | null;
  selectedContactName: string | null;
}

/**
 * The contact column of the Conversations tab.
 *
 * Client-side because the search is a local narrowing of an already-loaded
 * list — there is no server round trip and no URL state, so moving between
 * queries never reloads the open transcript.
 */
export function HermesConversationList({
  contacts,
  selectedContactId,
  selectedContactName,
}: HermesConversationListProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterConversationContacts(contacts, query), [contacts, query]);

  const searching = query.trim() !== "";
  // The open transcript is never filtered away, but the person can drop out of
  // the list. Say so and offer a way back rather than leaving a selected
  // contact the admin cannot see or return to.
  const selectedHidden =
    selectedContactId !== null && !visible.some((contact) => contact.id === selectedContactId);

  return (
    <div className="kitty-convo-list" aria-label="WhatsApp contacts">
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <label htmlFor="kitty-conversation-search" className="text-xs text-muted">
          Find a contact
        </label>
        <div style={{ position: "relative", marginTop: "4px" }}>
          <Search
            size={15}
            aria-hidden
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-muted)",
            }}
          />
          <input
            id="kitty-conversation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or WhatsApp number"
            autoComplete="off"
            className="text-sm"
            style={{
              width: "100%",
              minHeight: "38px",
              padding: "0 10px 0 32px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "inherit",
            }}
          />
        </div>
        <p className="text-xs text-muted" aria-live="polite" style={{ marginTop: "6px" }}>
          {searching
            ? `${visible.length} of ${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
            : `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`}
        </p>
      </div>

      {selectedHidden ? (
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-soft)",
          }}
        >
          <p className="text-xs text-muted">
            {selectedContactName ?? "The open contact"} is still open but not in these results.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-xs font-semibold text-navy"
            style={{
              marginTop: "4px",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear search
          </button>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <div style={{ padding: "16px" }}>
          <Empty>Add a contact from the Contacts tab to begin.</Empty>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "16px" }}>
          <Empty>No contact matches that name or number.</Empty>
        </div>
      ) : (
        visible.map((contact) => {
          const isSelected = selectedContactId === contact.id;
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
                  <p
                    className="text-sm font-semibold text-navy"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
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
                    {formatMessageTime(contact.conversation.latestAt)} · {contact.conversation.messageCount}{" "}
                    {contact.conversation.messageCount === 1 ? "message" : "messages"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted" style={{ marginTop: "8px" }}>
                  No WhatsApp messages yet
                </p>
              )}
            </Link>
          );
        })
      )}
    </div>
  );
}
