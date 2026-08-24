"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export const MARK_READ_EVENT = "insight-chat-mark-read";

export function markRead(_userId: string, conversationId: string) {
  window.dispatchEvent(new CustomEvent(MARK_READ_EVENT, { detail: { conversationId } }));
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
  const confirmedReadAtRef = useRef<Map<string, number>>(new Map());
  const eventRevisionRef = useRef(0);

  const refresh = useCallback(async () => {
    // A realtime insert can land while either query is in flight. Never let an
    // older server snapshot overwrite that newer local event.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const revision = eventRevisionRef.current;
      const { data } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      const ids: string[] = (data ?? []).map((row) => row.conversation_id as string);
      const { data: counts } = ids.length === 0
        ? { data: [] }
        : await supabase.rpc("get_unread_counts", {
            p_conversations: ids.map((id) => ({ conversation_id: id, last_read: null })),
          });

      if (revision !== eventRevisionRef.current) continue;
      convIdsRef.current = new Set(ids);
      const next: Record<string, number> = {};
      ids.forEach((id) => { next[id] = 0; });
      (counts ?? []).forEach((row: { conversation_id: string; unread_count: number }) => {
        next[row.conversation_id] = Number(row.unread_count) || 0;
      });
      setUnread(next);
      return;
    }
  }, [supabase, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Single stable-named channel; RLS already scopes events to rows this user can see.
  useEffect(() => {
    const channel = supabase
      .channel(`unread-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.sender_id === userId) return;
        const convId = payload.new.conversation_id as string;
        const createdAt = Date.parse(payload.new.created_at as string);
        const confirmedReadAt = confirmedReadAtRef.current.get(convId) ?? 0;
        if (Number.isFinite(createdAt) && createdAt <= confirmedReadAt) return;
        eventRevisionRef.current += 1;
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
      if (!convId) return;
      eventRevisionRef.current += 1;
      setUnread((prev) => (prev[convId] ? { ...prev, [convId]: 0 } : prev));
      void (async () => {
        const { data, error } = await supabase.rpc("mark_conversation_read", {
          p_conversation_id: convId,
        });
        if (!error && data) {
          confirmedReadAtRef.current.set(
            convId,
            Math.max(
              confirmedReadAtRef.current.get(convId) ?? 0,
              Date.parse(data as string),
            ),
          );
        }
        await refresh();
      })();
    };
    window.addEventListener(MARK_READ_EVENT, handler);
    return () => window.removeEventListener(MARK_READ_EVENT, handler);
  }, [refresh, supabase]);

  const markAsRead = useCallback((conversationId: string) => {
    markRead(userId, conversationId);
  }, [userId]);

  const total = useMemo(() => Object.values(unread).reduce((sum, n) => sum + n, 0), [unread]);
  const value = useMemo(() => ({ unread, total, markAsRead }), [unread, total, markAsRead]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
