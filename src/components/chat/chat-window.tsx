"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { createClient } from "@/lib/supabase/client";

export interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  sender: { id: string; full_name: string } | null;
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
            .select(
              "id, body, created_at, sender_id, sender:sender_id (id, full_name)",
            )
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

  const handleSend = async (body: string) => {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
    });

    if (error) {
      return error.message;
    }

    return null;
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-navy">{title}</h1>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length > 0 ? (
          <MessageList messages={messages} currentUserId={currentUserId} />
        ) : (
          <p className="text-sm text-muted">No messages yet.</p>
        )}
      </div>
      {readOnly ? null : (
        <div className="border-t border-border px-6 py-4">
          <MessageInput onSend={handleSend} />
        </div>
      )}
    </div>
  );
}
