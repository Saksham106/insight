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

  // Callers often rebuild the contacts array every render; key effects on the ID set,
  // not the array reference, so they only refire when membership actually changes.
  const convKey = contacts.map((c) => c.conversationId).sort().join(",");

  const computeAll = useCallback(async () => {
    const ids = convKey ? convKey.split(",") : [];
    if (ids.length === 0) return;
    const counts: Record<string, number> = {};
    await Promise.all(
      ids.map(async (conversationId) => {
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
  }, [convKey, currentUserId, supabase]);

  useEffect(() => { void computeAll(); }, [computeAll]);

  // Realtime: one channel for all conversations (RLS already scopes events to
  // rows this user can see); per-conversation channels churn realtime.subscription.
  useEffect(() => {
    const idSet = new Set(convKey ? convKey.split(",") : []);
    if (idSet.size === 0) return;
    const uid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`unread-${currentUserId}-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const convId = payload.new.conversation_id as string;
        if (idSet.has(convId) && payload.new.sender_id !== currentUserId) {
          setUnread((prev) => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [convKey, currentUserId, supabase]);

  const markAsRead = useCallback((conversationId: string) => {
    markRead(currentUserId, conversationId);
    setUnread((prev) => ({ ...prev, [conversationId]: 0 }));
  }, [currentUserId]);

  const total = Object.values(unread).reduce((sum, n) => sum + n, 0);

  return { unread, markAsRead, total };
}
