"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { useMediaQuery } from "@/lib/use-media-query";
import { MESSAGE_PAGE_SIZE, type ConversationSummary } from "@/lib/chat-types";
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
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/conversations?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setConversations((data.conversations as ConversationSummary[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link from the Groups page: /admin/chats?c=<id> opens that thread.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setActiveId(c);
  }, [searchParams]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

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
      {showList && (
        <div style={{ display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--color-border)", minHeight: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <p className="text-base font-semibold text-navy">All chats</p>
            <p className="text-xs text-muted">Read-only view of every conversation.</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading chats…</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>No conversations yet.</p>
            ) : (
              conversations.map((c) => {
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
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {active ? (
            <AdminThread
              key={active.id}
              conversation={active}
              currentUserId={currentUserId}
              onBack={isMobile ? () => setActiveId(null) : undefined}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
              <p className="text-sm text-muted" style={{ textAlign: "center" }}>Select a chat to read it.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AdminThread({
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

  const subtitle = conversation.isGroup ? conversation.members.map((m) => m.full_name.split(" ")[0]).join(", ") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
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
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatWindow
            conversationId={conversation.id}
            currentUserId={currentUserId}
            title={conversation.isGroup ? `${conversation.title}${subtitle ? ` · ${subtitle}` : ""}` : conversation.title}
            initialMessages={initial}
            initialHasMore={hasMore}
            readOnly
          />
        </div>
      )}
    </div>
  );
}
