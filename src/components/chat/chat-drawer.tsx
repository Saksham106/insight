"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { MessageInput, type FileAttachment } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import type { ChatMessage } from "@/components/chat/chat-window";
import type { ChatContact } from "@/lib/chat-types";
import { createClient } from "@/lib/supabase/client";
import { markRead, useUnreadCounts } from "@/lib/use-unread-counts";

export type { ChatContact };

interface ChatDrawerProps {
  contacts: ChatContact[];
  initialConversationId: string;
  currentUserId: string;
  readOnly?: boolean;
  adminView?: boolean;
  onClose: () => void;
}

export function ChatDrawer({ contacts, initialConversationId, currentUserId, readOnly = false, adminView = false, onClose }: ChatDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "picker">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const { unread, markAsRead } = useUnreadCounts(contacts, currentUserId);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Sync panel + backdrop to visualViewport so iOS keyboard can't expose the page behind
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (panelRef.current) { panelRef.current.style.top = `${vv.offsetTop}px`; panelRef.current.style.height = `${vv.height}px`; }
      if (backdropRef.current) { backdropRef.current.style.top = `${vv.offsetTop}px`; backdropRef.current.style.height = `${vv.height}px`; }
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", h); };
  }, [onClose]);

  // Mark active conversation read on open and on switch
  useEffect(() => {
    markRead(currentUserId, activeId);
    markAsRead(activeId);
    setMobileView("chat");
  }, [activeId, currentUserId, markAsRead]);

  // Fetch messages for active conversation
  useEffect(() => {
    setLoading(true);
    supabase
      .from("messages")
      .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages(
          (data ?? []).map((m) => ({ ...m, sender: Array.isArray(m.sender) ? m.sender[0] : m.sender })) as ChatMessage[],
        );
        setLoading(false);
      });
  }, [activeId, supabase]);

  // Realtime: active conversation messages
  useEffect(() => {
    const ch = supabase
      .channel(`drawer-msg-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, async (payload) => {
        const { data } = await supabase
          .from("messages")
          .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
          .eq("id", payload.new.id)
          .single();
        if (data) {
          const sender = Array.isArray(data.sender) ? data.sender[0] : data.sender;
          setMessages((prev) => [...prev, { ...data, sender } as ChatMessage]);
          markRead(currentUserId, activeId);
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [activeId, currentUserId, supabase]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (body: string | null, attachment?: FileAttachment | null) => {
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: currentUserId,
      body: body ?? null,
      ...(attachment ? { file_url: attachment.url, file_name: attachment.name, file_type: attachment.type } : {}),
    });
    return error ? error.message : null;
  };

  const activeContact = contacts.find((c) => c.conversationId === activeId);
  const showSidebar = contacts.length > 1;
  const SIDEBAR_W = 200;
  const CHAT_W = 420;

  const backdrop = (
    <div
      ref={backdropRef}
      onClick={onClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "100dvh",
        backgroundColor: isMobile ? "var(--color-background)" : "rgba(0,0,0,0.35)",
        zIndex: 40,
      }}
    />
  );

  const panelBase: React.CSSProperties = {
    position: "fixed", top: 0, right: 0, height: "100dvh", zIndex: 50,
    backgroundColor: "var(--color-surface)",
    borderLeft: isMobile ? "none" : "1px solid var(--color-border)",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
  };

  // ── Mobile picker screen ──────────────────────────────────────────────
  if (isMobile && mobileView === "picker") {
    return (
      <>
        {backdrop}
        <div ref={panelRef} style={{ ...panelBase, width: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
            <h2 className="text-base font-semibold text-navy">Messages</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--color-muted)", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {contacts.map(({ conversationId, name }) => {
              const count = unread[conversationId] ?? 0;
              const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button
                  key={conversationId}
                  onClick={() => setActiveId(conversationId)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "14px",
                    padding: "14px 20px", background: "none", border: "none",
                    borderBottom: "1px solid var(--color-border)", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--color-navy)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
                      {initials}
                    </div>
                    {count > 0 && (
                      <span style={{ position: "absolute", top: "-3px", right: "-3px", backgroundColor: "#ef4444", color: "white", fontSize: "10px", fontWeight: 700, borderRadius: "999px", minWidth: "17px", height: "17px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-sm font-semibold text-navy">{name}</p>
                    {count > 0 && <p className="text-xs text-muted" style={{ marginTop: "2px" }}>{count} unread message{count !== 1 ? "s" : ""}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ── Desktop sidebar + chat / Mobile chat ──────────────────────────────
  return (
    <>
      {backdrop}
      <div
        ref={panelRef}
        style={{
          ...panelBase,
          width: isMobile ? "100%" : `${showSidebar ? SIDEBAR_W + CHAT_W : CHAT_W}px`,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Desktop sidebar */}
        {!isMobile && showSidebar && (
          <div style={{ width: `${SIDEBAR_W}px`, borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Conversations</p>
            </div>
            {contacts.map(({ conversationId, name }) => {
              const isActive = conversationId === activeId;
              const count = unread[conversationId] ?? 0;
              const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button
                  key={conversationId}
                  onClick={() => setActiveId(conversationId)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", background: isActive ? "var(--color-soft)" : "none",
                    border: "none", borderLeft: isActive ? "3px solid var(--color-navy)" : "3px solid transparent",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "var(--color-navy)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>
                      {initials}
                    </div>
                    {count > 0 && (
                      <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "white", fontSize: "10px", fontWeight: 700, borderRadius: "999px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-foreground" style={{ fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Chat panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* ← back arrow on mobile when multiple contacts */}
              {isMobile && showSidebar && (
                <button
                  onClick={() => setMobileView("picker")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--color-navy)", display: "flex", alignItems: "center" }}
                  aria-label="All conversations"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h2 className="text-base font-semibold text-navy">
                {activeContact ? `Chat with ${activeContact.name}` : "Chat"}
              </h2>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--color-muted)", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : messages.length > 0 ? (
              <MessageList messages={messages} currentUserId={currentUserId} adminView={adminView} />
            ) : (
              <p className="text-sm text-muted">No messages yet. Say hello!</p>
            )}
          </div>

          {!readOnly && (
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
              <MessageInput conversationId={activeId} onSend={handleSend} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
