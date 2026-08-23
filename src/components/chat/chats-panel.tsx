"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquarePlus, Search, Users, ChevronLeft } from "lucide-react";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { useMobileThreadViewport } from "@/lib/use-mobile-thread-viewport";
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
  if (!c.lastMessage) return "Start the conversation";
  if (c.lastMessage.body) return c.lastMessage.body;
  if (c.lastMessage.fileName) return `Attachment · ${c.lastMessage.fileName}`;
  return "Attachment";
}

function conversationTime(c: ConversationSummary): string {
  const raw = c.lastMessage?.createdAt ?? c.updatedAt;
  const date = new Date(raw);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatsPanel({ currentUserId }: ChatsPanelProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(requestedConversationId);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState("");
  const threadOverlayRef = useRef<HTMLDivElement>(null);
  const { unread } = useUnread();

  const supabase = useMemo(() => createClient(), []);

  const loadConversations = useCallback(async () => {
    // Unique URL + no-store defeats any HTTP/304 caching so a just-created
    // conversation always shows up on the immediate post-create refresh.
    try {
      const res = await fetch(`/api/chat/conversations?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setConversations((data.conversations as ConversationSummary[]) ?? []);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 0);
    return () => window.clearTimeout(timer);
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
  const filteredConversations = conversations.filter((conversation) =>
    `${conversation.title} ${lastMessagePreview(conversation)}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!loading && requestedConversationId && conversations.some((conversation) => conversation.id === requestedConversationId)) {
      markRead(currentUserId, requestedConversationId);
    }
  }, [conversations, currentUserId, loading, requestedConversationId]);

  useEffect(() => {
    const syncThreadFromHistory = () => {
      setActiveId(new URLSearchParams(window.location.search).get("conversation"));
    };
    window.addEventListener("popstate", syncThreadFromHistory);
    return () => window.removeEventListener("popstate", syncThreadFromHistory);
  }, []);

  useMobileThreadViewport(isMobile && Boolean(activeId), threadOverlayRef);

  const openConversation = (id: string) => {
    setActiveId(id);
    window.history.pushState({ insightThread: true }, "", `${pathname}?conversation=${encodeURIComponent(id)}`);
    markRead(currentUserId, id);
  };

  const closeConversation = () => {
    setActiveId(null);
    window.history.replaceState({ ...window.history.state, insightThread: false }, "", pathname);
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
      className={isMobile ? "bg-surface" : "border border-border bg-surface"}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
        borderRadius: isMobile ? 0 : "12px",
        overflow: "hidden",
        // On phones the inbox is the screen, not a card inside a dashboard.
        // Subtract the app header + tab bar, including both iPhone safe areas.
        height: isMobile
          ? "calc(100dvh - 60px - 64px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
          : "calc(100dvh - 13rem)",
        minHeight: isMobile ? "420px" : undefined,
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
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              padding: isMobile ? "14px 16px 12px" : "14px 16px",
              borderBottom: "1px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <p
                className="font-semibold text-navy"
                style={{ margin: 0, fontSize: isMobile ? "28px" : "16px", letterSpacing: isMobile ? "-0.03em" : undefined }}
              >
                Messages
              </p>
              <button
                type="button"
                onClick={() => setShowNew(true)}
                aria-label="Start a new conversation"
                style={{
                  width: "42px",
                  height: "42px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  borderRadius: "50%",
                  background: "var(--color-accent-soft)",
                  color: "var(--color-navy)",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <MessageSquarePlus size={20} />
              </button>
            </div>
            {isMobile && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "12px",
                  background: "var(--color-soft)",
                  color: "var(--color-muted)",
                }}
              >
                <Search size={16} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  aria-label="Search conversations"
                  style={{
                    width: "100%",
                    border: 0,
                    outline: 0,
                    background: "transparent",
                    color: "var(--color-foreground)",
                    font: "inherit",
                    fontSize: "15px",
                  }}
                />
              </label>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading chats…</p>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p className="text-sm font-semibold text-navy" style={{ margin: 0 }}>
                  {query ? "No conversations found" : "No messages yet"}
                </p>
                <p className="text-sm text-muted" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
                  {query ? "Try a different name or message." : "Start a conversation when you need to coordinate."}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => {
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
                      padding: isMobile ? "11px 16px" : "12px 16px",
                      minHeight: isMobile ? "72px" : undefined,
                      border: "none",
                      borderBottom: "1px solid var(--color-border)",
                      background: isActive ? "var(--color-soft)" : "transparent",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? "50px" : "42px",
                        height: isMobile ? "50px" : "42px",
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
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                        <p className="text-sm font-semibold text-navy" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title}
                        </p>
                        <span
                          className="text-xs"
                          style={{ flexShrink: 0, color: unreadCount > 0 ? "var(--color-navy)" : "var(--color-muted)", fontWeight: unreadCount > 0 ? 600 : 400 }}
                        >
                          {conversationTime(c)}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                        <p className="text-sm text-muted" style={{ minWidth: 0, flex: 1, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.isGroup ? `${c.members.length} members · ` : ""}
                          {lastMessagePreview(c)}
                        </p>
                        {unreadCount > 0 && (
                          <span
                            aria-label={`${unreadCount} unread messages`}
                            style={{
                              flexShrink: 0,
                              background: "var(--color-navy)",
                              color: "#fff",
                              borderRadius: "9999px",
                              fontSize: "10px",
                              fontWeight: 700,
                              minWidth: "19px",
                              height: "19px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0 5px",
                            }}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>
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
        <div
          ref={isMobile ? threadOverlayRef : undefined}
          style={isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "100dvh",
                zIndex: 80,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                background: "var(--color-surface)",
                overscrollBehavior: "none",
                touchAction: "pan-y",
              }
            : { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}
        >
          {activeConversation ? (
            <ActiveConversation
              key={activeConversation.id}
              conversation={activeConversation}
              currentUserId={currentUserId}
              onBack={isMobile ? closeConversation : undefined}
              fullScreen={isMobile}
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
  fullScreen = false,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  onBack?: () => void;
  fullScreen?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [initial, setInitial] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const handleIncomingMessage = useCallback(() => {
    markRead(currentUserId, conversation.id);
  }, [conversation.id, currentUserId]);

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
    ? `${conversation.members.length} members`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%" }}>
      {onBack && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 10px",
            paddingTop: fullScreen ? "calc(8px + env(safe-area-inset-top, 0px))" : "8px",
            borderBottom: "1px solid color-mix(in oklab, var(--color-border) 75%, transparent)",
            backgroundColor: "color-mix(in oklab, var(--color-surface) 94%, transparent)",
            backdropFilter: "saturate(180%) blur(18px)",
            WebkitBackdropFilter: "saturate(180%) blur(18px)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              background: "none",
              border: "none",
              padding: "6px 6px 6px 0",
              cursor: "pointer",
              color: "var(--color-navy)",
              minHeight: "44px",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <div
            aria-hidden
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-accent-soft)",
              color: "var(--color-navy)",
              fontWeight: 700,
              fontSize: "12px",
            }}
          >
            {conversation.isGroup ? <Users size={16} /> : initials(conversation.title)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="text-sm font-semibold text-navy" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conversation.title}
            </p>
            {subtitle && (
              <p className="text-xs text-muted" style={{ margin: 0 }}>{subtitle}</p>
            )}
          </div>
        </div>
      )}
      {initial === null ? (
        <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading messages…</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <ChatWindow
            conversationId={conversation.id}
            currentUserId={currentUserId}
            title={conversation.title}
            initialMessages={initial}
            initialHasMore={hasMore}
            fill
            hideHeader={Boolean(onBack)}
            showSenderNames={conversation.isGroup}
            onIncomingMessage={handleIncomingMessage}
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
                      background: "var(--color-accent-soft)",
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
