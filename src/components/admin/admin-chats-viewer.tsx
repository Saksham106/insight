"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Plus, Search, Users } from "lucide-react";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewConversationModal } from "@/components/admin/new-conversation-modal";
import { ConversationMembersModal } from "@/components/admin/conversation-members-modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { MESSAGE_PAGE_SIZE, type ChattableContact, type ConversationSummary } from "@/lib/chat-types";
import { createClient } from "@/lib/supabase/client";

interface AdminChatsViewerProps {
  currentUserId: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function preview(c: ConversationSummary): string {
  if (!c.lastMessage) return "No messages yet";
  if (c.lastMessage.body) return c.lastMessage.body;
  if (c.lastMessage.fileName) return `📎 ${c.lastMessage.fileName}`;
  return "Attachment";
}

export function AdminChatsViewer({ currentUserId }: AdminChatsViewerProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ChattableContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const load = useCallback(async () => {
    const [convRes, contactsRes] = await Promise.all([
      fetch(`/api/admin/conversations?t=${Date.now()}`, { cache: "no-store" }),
      fetch("/api/chat/contacts", { cache: "no-store" }),
    ]);
    const [c, k] = await Promise.all([
      convRes.json().catch(() => ({})),
      contactsRes.json().catch(() => ({})),
    ]);
    // A transient 500 or expired session should leave the last-good list on
    // screen rather than blanking it — there's no refresh affordance here.
    if (convRes.ok) setConversations((c.conversations as ConversationSummary[]) ?? []);
    if (contactsRes.ok) setContacts((k.contacts as ChattableContact[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link support: a `?c=<id>` query param opens that conversation directly.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setActiveId(c);
  }, [searchParams]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // This list holds every conversation in the academy — the largest in the app —
  // so it needs to be searchable by chat name or by who's in it.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.members.some((m) => m.full_name.toLowerCase().includes(q)),
    );
  }, [conversations, search]);

  const showList = !isMobile || !activeId;
  const showThread = !isMobile || Boolean(activeId);

  return (
    <section
      className="border border-border bg-surface"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
        borderRadius: "12px",
        overflow: "hidden",
        height: "calc(100dvh - 13rem)",
      }}
    >
      {showList && (
        <div style={{ display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--color-border)", minHeight: 0, minWidth: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <div style={{ minWidth: 0 }}>
                <p className="text-base font-semibold text-navy">All chats</p>
                <p className="text-xs text-muted">Every conversation in the academy.</p>
              </div>
              <Button size="sm" onClick={() => setShowNew(true)} style={{ flexShrink: 0 }}>
                <Plus style={{ height: "16px", width: "16px", marginRight: "6px" }} />
                New
              </Button>
            </div>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }}
              />
              <Input
                placeholder="Search chats or people"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "32px" }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading chats…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>
                {search.trim() ? "No chats match that search." : "No conversations yet."}
              </p>
            ) : (
              visible.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      border: "none",
                      borderBottom: "1px solid var(--color-border)",
                      background: isActive ? "var(--color-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--color-accent-soft)",
                        color: "var(--color-navy)",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {c.isGroup ? <Users size={18} /> : initials(c.title)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="text-sm font-semibold text-navy" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </p>
                      <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.isGroup ? `${c.members.length} members · ` : ""}
                        {preview(c)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {showThread && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
          {active ? (
            <AdminThread
              key={active.id}
              conversation={active}
              currentUserId={currentUserId}
              onManageMembers={() => setShowMembers(true)}
              onBack={isMobile ? () => setActiveId(null) : undefined}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
              <p className="text-sm text-muted" style={{ textAlign: "center" }}>Select a chat to read it.</p>
            </div>
          )}
        </div>
      )}

      {showNew && (
        <NewConversationModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await load();
            setActiveId(id);
          }}
        />
      )}

      {showMembers && active && (
        <ConversationMembersModal
          conversation={active}
          contacts={contacts}
          onClose={() => setShowMembers(false)}
          onChanged={async () => {
            setShowMembers(false);
            await load();
          }}
          onArchived={(id) => {
            // Optimistically drop the row so archiving feels instant, then
            // reconcile with the server.
            setConversations((prev) => prev.filter((c) => c.id !== id));
            setShowMembers(false);
            setActiveId(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function AdminThread({
  conversation,
  currentUserId,
  onManageMembers,
  onBack,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  onManageMembers: () => void;
  onBack?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [initial, setInitial] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (cancelled) return;
      const msgs = (data ?? [])
        .reverse()
        .map((m) => ({ ...m, sender: Array.isArray(m.sender) ? m.sender[0] : m.sender }) as ChatMessage);
      setInitial(msgs);
      setHasMore((data ?? []).length === MESSAGE_PAGE_SIZE);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, conversation.id]);

  const subtitle = conversation.isGroup ? conversation.members.map((m) => m.full_name.split(" ")[0]).join(", ") : null;

  // The admin is not a participant in conversations they create, so most threads
  // are read-only to them. Their own DMs are the exception — people can message
  // an admin directly, and this is the only surface where those can be answered.
  const isMember = conversation.members.some((m) => m.id === currentUserId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%" }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-navy"
          style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
        >
          <ChevronLeft size={16} /> All chats
        </button>
      )}
      {initial === null ? (
        <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading messages…</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 14px",
              borderBottom: "1px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conversation.members.length} {conversation.members.length === 1 ? "member" : "members"}
            </p>
            <Button variant="outline" size="sm" onClick={onManageMembers} style={{ flexShrink: 0 }}>
              <Users size={15} style={{ marginRight: "6px" }} /> Members
            </Button>
          </div>
          <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <ChatWindow
              conversationId={conversation.id}
              currentUserId={currentUserId}
              title={conversation.isGroup ? `${conversation.title}${subtitle ? ` · ${subtitle}` : ""}` : conversation.title}
              initialMessages={initial}
              initialHasMore={hasMore}
              readOnly={!isMember}
              fill
            />
          </div>
          {!isMember && (
            <p
              className="text-xs text-muted"
              style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", flexShrink: 0, textAlign: "center" }}
            >
              You&apos;re not in this chat — view only.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
