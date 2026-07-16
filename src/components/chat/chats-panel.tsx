"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Search, Users, ChevronLeft } from "lucide-react";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { markRead } from "@/lib/use-unread-counts";
import { useUnread } from "@/lib/unread-context";
import { MESSAGE_PAGE_SIZE, type ChattableContact, type ConversationSummary } from "@/lib/chat-types";
import { createClient } from "@/lib/supabase/client";

interface ChatsPanelProps {
  currentUserId: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function lastMessagePreview(c: ConversationSummary): string {
  if (!c.lastMessage) return "No messages yet";
  if (c.lastMessage.body) return c.lastMessage.body;
  if (c.lastMessage.fileName) return `📎 ${c.lastMessage.fileName}`;
  return "Attachment";
}

export function ChatsPanel({ currentUserId }: ChatsPanelProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const { unread } = useUnread();

  const supabase = useMemo(() => createClient(), []);

  const loadConversations = useCallback(async () => {
    // Unique URL + no-store defeats any HTTP/304 caching so a just-created
    // conversation always shows up on the immediate post-create refresh.
    const res = await fetch(`/api/chat/conversations?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setConversations((data.conversations as ConversationSummary[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Keep the list live: any new message refreshes ordering + previews.
  useEffect(() => {
    const channel = supabase
      .channel(`chats-panel-${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void loadConversations();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, loadConversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const openConversation = (id: string) => {
    setActiveId(id);
    markRead(currentUserId, id);
  };

  const handleCreated = async (conversationId: string) => {
    setShowNew(false);
    await loadConversations();
    openConversation(conversationId);
  };

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
        height: "72vh",
      }}
    >
      {/* Conversation list */}
      {showList && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: isMobile ? "none" : "1px solid var(--color-border)",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <p className="text-base font-semibold text-navy">Chats</p>
            <Button size="sm" onClick={() => setShowNew(true)}>
              <MessageSquarePlus style={{ height: "16px", width: "16px", marginRight: "6px" }} />
              New
            </Button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading chats…</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted" style={{ padding: "16px", lineHeight: 1.5 }}>
                No chats yet. Tap <span className="font-semibold">New</span> to start a conversation or group.
              </p>
            ) : (
              conversations.map((c) => {
                const unreadCount = unread[c.id] ?? 0;
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConversation(c.id)}
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
                        background: "rgba(27,53,96,0.10)",
                        color: "var(--color-navy)",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {c.isGroup ? <Users size={18} /> : initials(c.title)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <p className="text-sm font-semibold text-navy" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title}
                        </p>
                        {unreadCount > 0 && (
                          <span
                            style={{
                              flexShrink: 0,
                              background: "var(--color-navy)",
                              color: "#fff",
                              borderRadius: "9999px",
                              fontSize: "11px",
                              fontWeight: 700,
                              minWidth: "18px",
                              height: "18px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0 5px",
                            }}
                          >
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.isGroup ? `${c.members.length} members · ` : ""}
                        {lastMessagePreview(c)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Active conversation */}
      {showThread && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeConversation ? (
            <ActiveConversation
              key={activeConversation.id}
              conversation={activeConversation}
              currentUserId={currentUserId}
              onBack={isMobile ? () => setActiveId(null) : undefined}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
              <p className="text-sm text-muted" style={{ textAlign: "center" }}>
                Select a chat to start messaging.
              </p>
            </div>
          )}
        </div>
      )}

      {showNew && (
        <NewChatModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </section>
  );
}

function ActiveConversation({
  conversation,
  currentUserId,
  onBack,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
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

  const subtitle = conversation.isGroup
    ? conversation.members.map((m) => (m.id === currentUserId ? "You" : m.full_name.split(" ")[0])).join(", ")
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-navy"
          style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
        >
          <ChevronLeft size={16} /> Chats
        </button>
      )}
      {initial === null ? (
        <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading messages…</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatWindow
            conversationId={conversation.id}
            currentUserId={currentUserId}
            title={conversation.isGroup ? `${conversation.title}${subtitle ? ` · ${subtitle}` : ""}` : conversation.title}
            initialMessages={initial}
            initialHasMore={hasMore}
          />
        </div>
      )}
    </div>
  );
}

function NewChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [contacts, setContacts] = useState<ChattableContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/chat/contacts", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) setContacts((data.contacts as ChattableContact[]) ?? []);
      else setError(data.error ?? "Could not load contacts.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = contacts.filter((c) => c.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const isGroup = selected.size > 1;

  const create = async () => {
    setError(null);
    if (selected.size === 0) {
      setError("Pick at least one person.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [...selected], title: isGroup ? groupName : null }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Could not start the chat.");
      return;
    }
    onCreated(data.conversationId as string);
  };

  return (
    <Modal onClose={onClose} title="New chat">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <Input
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "30px" }}
          />
        </div>

        {isGroup && (
          <Input
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
          {loading ? (
            <p className="text-sm text-muted" style={{ padding: "8px" }}>Loading contacts…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted" style={{ padding: "8px" }}>No contacts found.</p>
          ) : (
            filtered.map((c) => {
              const checked = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: checked ? "var(--color-soft)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(27,53,96,0.10)",
                      color: "var(--color-navy)",
                      fontWeight: 700,
                      fontSize: "12px",
                      flexShrink: 0,
                    }}
                  >
                    {initials(c.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-sm font-medium text-navy" style={{ margin: 0 }}>{c.full_name}</p>
                    <p className="text-xs text-muted" style={{ margin: 0, textTransform: "capitalize" }}>{c.role}</p>
                  </div>
                  <span
                    aria-hidden
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "5px",
                      border: `2px solid ${checked ? "var(--color-navy)" : "var(--color-border)"}`,
                      background: checked ? "var(--color-navy)" : "transparent",
                      flexShrink: 0,
                    }}
                  />
                </button>
              );
            })
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <p className="text-xs text-muted">
            {selected.size === 0 ? "Select people" : isGroup ? `Group · ${selected.size} people` : "Direct chat"}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={creating || selected.size === 0}>
              {creating ? "Starting…" : "Start chat"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
