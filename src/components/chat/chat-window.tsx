"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { MessageInput, type FileAttachment } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { MESSAGE_PAGE_SIZE } from "@/lib/chat-types";
import { createClient } from "@/lib/supabase/client";

export interface ChatMessage {
  id: string;
  body: string | null;
  created_at: string;
  sender_id: string;
  sender: { id: string; full_name: string } | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
}

type MessageRow = Omit<ChatMessage, "sender">;

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  title: string;
  initialMessages: ChatMessage[];
  initialHasMore?: boolean;
  readOnly?: boolean;
  // Hide the internal title bar when the parent already shows one (e.g. the
  // mobile thread header with back button + avatar).
  hideHeader?: boolean;
  showSenderNames?: boolean;
  onIncomingMessage?: () => void;
  // When embedded in a parent that already sizes it (e.g. the two-pane chat
  // panels), fill the parent's height. Standalone pages leave this false and the
  // window sizes itself to the viewport below the header.
  fill?: boolean;
}

export function ChatWindow({
  conversationId,
  currentUserId,
  title,
  initialMessages,
  initialHasMore = false,
  readOnly = false,
  hideHeader = false,
  showSenderNames = false,
  onIncomingMessage,
  fill = false,
}: ChatWindowProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  // scrollHeight captured before a prepend so older messages don't yank the view
  const prependHeightRef = useRef<number | null>(null);

  // Sender names seen so far; lets the realtime handler build messages from the
  // INSERT payload without a per-message round trip.
  const senderNamesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    messages.forEach((m) => { if (m.sender) senderNamesRef.current.set(m.sender.id, m.sender.full_name); });
  }, [messages]);

  const resolveSender = useCallback(async (senderId: string): Promise<ChatMessage["sender"]> => {
    const known = senderNamesRef.current.get(senderId);
    if (known !== undefined) return { id: senderId, full_name: known };
    const { data } = await supabase.from("profiles").select("id, full_name").eq("id", senderId).single();
    senderNamesRef.current.set(senderId, data?.full_name ?? "User");
    return data ?? { id: senderId, full_name: "User" };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as MessageRow;
          const sender = await resolveSender(row.sender_id);
          setMessages((current) =>
            current.some((m) => m.id === row.id) ? current : [...current, { ...row, sender }],
          );
          if (row.sender_id !== currentUserId) {
            window.setTimeout(() => onIncomingMessage?.(), 0);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, onIncomingMessage, resolveSender, supabase]);

  const loadOlder = useCallback(async () => {
    const oldest = messages[0]?.created_at;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data } = await supabase
      .from("messages")
      .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    const older = (data ?? [])
      .reverse()
      .map((m) => ({ ...m, sender: Array.isArray(m.sender) ? m.sender[0] : m.sender }) as ChatMessage);
    prependHeightRef.current = scrollRef.current?.scrollHeight ?? null;
    setMessages((current) => [...older, ...current]);
    setHasMore((data ?? []).length === MESSAGE_PAGE_SIZE);
    setLoadingOlder(false);
  }, [conversationId, loadingOlder, messages, supabase]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (shouldAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // iOS resizes visualViewport after the keyboard opens. Keep the newest message
  // above the pinned composer instead of leaving it hidden behind the footer.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const keepLatestVisible = () => {
      if (!(document.activeElement instanceof HTMLTextAreaElement)) return;
      if (!shouldAutoScrollRef.current) return;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };
    viewport.addEventListener("resize", keepLatestVisible);
    return () => viewport.removeEventListener("resize", keepLatestVisible);
  }, []);

  const handleSend = async (body: string | null, attachment?: FileAttachment | null) => {
    shouldAutoScrollRef.current = true;
    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, body, attachment: attachment ?? null }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return result.error ?? "Could not send message.";

    const data = result.message as MessageRow | undefined;
    // Append immediately so the sender sees their own message without waiting on
    // the realtime echo; the realtime handler dedupes by id.
    if (data) {
      const sender = await resolveSender(data.sender_id);
      setMessages((current) => (current.some((m) => m.id === data.id) ? current : [...current, { ...data, sender } as ChatMessage]));
    }
    return null;
  };

  return (
    <div
      className="bg-surface"
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) {
          const element = scrollRef.current;
          if (element) {
            shouldAutoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }
          setComposerFocused(true);
        }
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) setComposerFocused(false);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        // Fill the sizing parent when embedded; otherwise take the viewport
        // below the dashboard header. `dvh` tracks the mobile visual viewport so
        // the composer stays above the on-screen keyboard.
        height: fill ? "100%" : "calc(100dvh - 8rem)",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {hideHeader ? null : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              className="text-sm font-semibold text-navy"
              style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {title}
            </p>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldAutoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="px-3 py-4"
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          background: "var(--color-background)",
          scrollPaddingBottom: "16px",
        }}
      >
        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="text-xs text-muted"
              style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: "999px", padding: "4px 12px", cursor: loadingOlder ? "default" : "pointer" }}
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.length > 0 ? (
          <MessageList messages={messages} currentUserId={currentUserId} showSenderNames={showSenderNames} />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
            <p className="text-sm text-muted" style={{ margin: 0, textAlign: "center", lineHeight: 1.5 }}>
              No messages yet. Say hello.
            </p>
          </div>
        )}
      </div>
      {readOnly ? null : (
        <div
          className="px-3 py-2"
          style={{
            flexShrink: 0,
            backgroundColor: "color-mix(in oklab, var(--color-surface) 94%, transparent)",
            backdropFilter: "saturate(180%) blur(18px)",
            WebkitBackdropFilter: "saturate(180%) blur(18px)",
            // Keep the composer clear of the iOS home indicator when the thread
            // is used standalone (full-viewport contexts).
            paddingBottom: composerFocused
              ? "8px"
              : "max(8px, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <MessageInput conversationId={conversationId} onSend={handleSend} />
        </div>
      )}
    </div>
  );
}
