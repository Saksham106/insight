"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

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

interface UnreadContextValue {
  unread: Record<string, number>;
  total: number;
  markAsRead: (conversationId: string) => void;
}

const UnreadContext = createContext<UnreadContextValue>({ unread: {}, total: 0, markAsRead: () => {} });

export function useUnread() {
  return useContext(UnreadContext);
}

interface UnreadProviderProps {
  userId: string;
  role: "admin" | "teacher" | "student" | "parent";
  children: React.ReactNode;
}

// Mounted once in the dashboard layout: one conversation-ID fetch, one aggregated
// RPC, and one realtime channel for the whole session — instead of per-conversation
// count queries duplicated across the header, dashboard body, and drawer.
export function UnreadProvider({ userId, children }: UnreadProviderProps) {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const convIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    // Membership is the single source of truth — covers 1:1 (backfilled) and
    // group conversations. RLS lets a user read their own participant rows.
    const { data } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);

    const ids: string[] = (data ?? []).map((row) => row.conversation_id as string);
    convIdsRef.current = new Set(ids);

    if (ids.length === 0) { setUnread({}); return; }
    const { data: counts } = await supabase.rpc("get_unread_counts", {
      p_conversations: ids.map((id) => ({ conversation_id: id, last_read: getLastRead(userId, id) })),
    });
    const next: Record<string, number> = {};
    ids.forEach((id) => { next[id] = 0; });
    (counts ?? []).forEach((row: { conversation_id: string; unread_count: number }) => {
      next[row.conversation_id] = Number(row.unread_count) || 0;
    });
    setUnread(next);
  }, [supabase, userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Single stable-named channel; RLS already scopes events to rows this user can see.
  useEffect(() => {
    const channel = supabase
      .channel(`unread-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.sender_id === userId) return;
        const convId = payload.new.conversation_id as string;
        if (convIdsRef.current.has(convId)) {
          setUnread((prev) => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
        } else {
          // Message in a conversation created after mount — refetch membership
          void refresh();
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, supabase, userId]);

  // Zero a conversation whenever anything calls markRead() (drawer open/switch, incoming
  // message while the conversation is on screen).
  useEffect(() => {
    const handler = (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (convId) setUnread((prev) => (prev[convId] ? { ...prev, [convId]: 0 } : prev));
    };
    window.addEventListener(MARK_READ_EVENT, handler);
    return () => window.removeEventListener(MARK_READ_EVENT, handler);
  }, []);

  const markAsRead = useCallback((conversationId: string) => {
    markRead(userId, conversationId);
  }, [userId]);

  const total = useMemo(() => Object.values(unread).reduce((sum, n) => sum + n, 0), [unread]);
  const value = useMemo(() => ({ unread, total, markAsRead }), [unread, total, markAsRead]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
