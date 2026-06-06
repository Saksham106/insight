"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { MessageInput, type FileAttachment } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/components/chat/chat-window";

interface ChatDrawerProps {
  conversationId: string;
  currentUserId: string;
  title: string;
  readOnly?: boolean;
  onClose: () => void;
}

export function ChatDrawer({
  conversationId,
  currentUserId,
  title,
  readOnly = false,
  onClose,
}: ChatDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Responsive width
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close on Escape + lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  // Fetch initial messages
  useEffect(() => {
    setLoading(true);
    supabase
      .from("messages")
      .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const normalized = (data ?? []).map((m) => ({
          ...m,
          sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
        })) as ChatMessage[];
        setMessages(normalized);
        setLoading(false);
      });
  }, [conversationId, supabase]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`drawer-messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            const sender = Array.isArray(data.sender) ? data.sender[0] : data.sender;
            setMessages((prev) => [...prev, { ...data, sender } as ChatMessage]);
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, supabase]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

  const drawerWidth = isMobile ? "100vw" : "420px";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: isMobile ? "var(--color-background)" : "rgba(0,0,0,0.35)",
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: drawerWidth,
          height: isMobile ? "100dvh" : undefined,
          bottom: isMobile ? undefined : 0,
          zIndex: 50,
          backgroundColor: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--color-muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", padding: "20px" }}
        >
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : messages.length > 0 ? (
            <MessageList messages={messages} currentUserId={currentUserId} />
          ) : (
            <p className="text-sm text-muted">No messages yet. Say hello!</p>
          )}
        </div>

        {/* Input */}
        {!readOnly && (
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            <MessageInput conversationId={conversationId} onSend={handleSend} />
          </div>
        )}
      </div>
    </>
  );
}
