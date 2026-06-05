"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MessageInput, type FileAttachment } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
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

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  title: string;
  initialMessages: ChatMessage[];
  readOnly?: boolean;
}

export function ChatWindow({
  conversationId,
  currentUserId,
  title,
  initialMessages,
  readOnly = false,
}: ChatWindowProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          const { data } = await supabase
            .from("messages")
            .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const sender = Array.isArray(data.sender)
              ? data.sender[0]
              : data.sender;
            setMessages((current) => [
              ...current,
              { ...data, sender } as ChatMessage,
            ]);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

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

  return (
    <div
      className="rounded-lg border border-border bg-surface"
      style={{ display: "flex", flexDirection: "column", height: "70vh" }}
    >
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h1 className="text-lg font-semibold text-navy">{title}</h1>
      </div>
      <div ref={scrollRef} className="px-6 py-4" style={{ flex: 1, overflowY: "auto" }}>
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
