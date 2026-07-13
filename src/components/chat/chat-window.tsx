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
}

export function ChatWindow({
  conversationId,
  currentUserId,
  title,
  initialMessages,
  initialHasMore = false,
  readOnly = false,
}: ChatWindowProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, resolveSender, supabase]);

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
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (body: string | null, attachment?: FileAttachment | null) => {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: body ?? null,
      ...(attachment ? { file_url: attachment.url, file_name: attachment.name, file_type: attachment.type } : {}),
    });
    return error ? error.message : null;
  };

  return (
    <div
      className="rounded-lg border border-border bg-surface"
      style={{ display: "flex", flexDirection: "column", height: "70vh" }}
    >
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h1 className="text-lg font-semibold text-navy">{title}</h1>
      </div>
      <div ref={scrollRef} className="px-6 py-4" style={{ flex: 1, overflowY: "auto" }}>
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
          <MessageList messages={messages} currentUserId={currentUserId} />
        ) : (
          <p className="text-sm text-muted">No messages yet.</p>
        )}
      </div>
      {readOnly ? null : (
        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <MessageInput conversationId={conversationId} onSend={handleSend} />
        </div>
      )}
    </div>
  );
}
