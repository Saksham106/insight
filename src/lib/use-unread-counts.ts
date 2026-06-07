"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ChatContact } from "@/lib/chat-types";

export const MARK_READ_EVENT = "insight-chat-mark-read";

function lrKey(userId: string, conversationId: string) {
  return `insight-chat-lr-${userId}-${conversationId}`;
}

export function getLastRead(userId: string, conversationId: string): string | null {
  try { return localStorage.getItem(lrKey(userId, conversationId)); } catch { return null; }
}

export function markRead(userId: string, conversationId: string) {
  try {
    localStorage.setItem(lrKey(userId, conversationId), new Date().toISOString());
    window.dispatchEvent(new CustomEvent(MARK_READ_EVENT, { detail: { conversationId } }));
  } catch {}
}

export function useUnreadCounts(contacts: ChatContact[], currentUserId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const computeAll = useCallback(async () => {
    if (contacts.length === 0) return;
    const counts: Record<string, number> = {};
    await Promise.all(
      contacts.map(async ({ conversationId }) => {
        const lastRead = getLastRead(currentUserId, conversationId);
        let q = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .neq("sender_id", currentUserId);
        if (lastRead) q = q.gt("created_at", lastRead);
        const { count } = await q;
        counts[conversationId] = count ?? 0;
      }),
    );
    setUnread(counts);
  }, [contacts, currentUserId, supabase]);

  useEffect(() => { void computeAll(); }, [computeAll]);

  // Realtime: bump counts on new incoming messages
  useEffect(() => {
    if (contacts.length === 0) return;
    const uid = Math.random().toString(36).slice(2);
    const channels = contacts.map(({ conversationId }) =>
      supabase
        .channel(`unread-${currentUserId}-${conversationId}-${uid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          if (payload.new.sender_id !== currentUserId) {
            setUnread((prev) => ({ ...prev, [conversationId]: (prev[conversationId] ?? 0) + 1 }));
          }
        })
        .subscribe(),
    );
    return () => { channels.forEach((c) => { void supabase.removeChannel(c); }); };
  }, [contacts, currentUserId, supabase]);

  const markAsRead = useCallback((conversationId: string) => {
    markRead(currentUserId, conversationId);
    setUnread((prev) => ({ ...prev, [conversationId]: 0 }));
  }, [currentUserId]);

  const total = Object.values(unread).reduce((sum, n) => sum + n, 0);

  return { unread, markAsRead, total };
}
