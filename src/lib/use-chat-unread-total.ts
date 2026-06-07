"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { MARK_READ_EVENT, getLastRead } from "@/lib/use-unread-counts";

export function useChatUnreadTotal(userId: string, role: "admin" | "teacher" | "student") {
  const supabase = useMemo(() => createClient(), []);
  const [convIds, setConvIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  // Fetch all conversation IDs for this user
  useEffect(() => {
    if (role === "admin") return;
    const col = role === "teacher" ? "teacher_id" : "student_id";
    supabase
      .from("teacher_student_assignments")
      .select("conversation:conversations (id)")
      .eq(col, userId)
      .eq("is_active", true)
      .then(({ data }) => {
        const ids: string[] = [];
        (data ?? []).forEach((row) => {
          const conv = Array.isArray(row.conversation) ? row.conversation : row.conversation ? [row.conversation as { id: string }] : [];
          conv.forEach((c) => ids.push(c.id));
        });
        setConvIds(ids);
      });
  }, [userId, role, supabase]);

  // Compute total unread
  useEffect(() => {
    if (convIds.length === 0) { setTotal(0); return; }
    const compute = async () => {
      let t = 0;
      await Promise.all(
        convIds.map(async (conversationId) => {
          const lastRead = getLastRead(userId, conversationId);
          let q = supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", userId);
          if (lastRead) q = q.gt("created_at", lastRead);
          const { count } = await q;
          t += count ?? 0;
        }),
      );
      setTotal(t);
    };
    void compute();
  }, [convIds, userId, supabase]);

  // Realtime: bump total on new incoming messages
  useEffect(() => {
    if (convIds.length === 0) return;
    const uid = Math.random().toString(36).slice(2);
    const channels = convIds.map((conversationId) =>
      supabase
        .channel(`hdr-unread-${userId}-${conversationId}-${uid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          if (payload.new.sender_id !== userId) setTotal((prev) => prev + 1);
        })
        .subscribe(),
    );
    return () => { channels.forEach((c) => { void supabase.removeChannel(c); }); };
  }, [convIds, userId, supabase]);

  // Listen for mark-read events dispatched by the drawer to decrement total
  useEffect(() => {
    const handler = () => {
      // Recompute rather than guess the decrement to stay accurate
      if (convIds.length === 0) return;
      const compute = async () => {
        let t = 0;
        await Promise.all(
          convIds.map(async (conversationId) => {
            const lastRead = getLastRead(userId, conversationId);
            let q = supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conversationId)
              .neq("sender_id", userId);
            if (lastRead) q = q.gt("created_at", lastRead);
            const { count } = await q;
            t += count ?? 0;
          }),
        );
        setTotal(t);
      };
      void compute();
    };
    window.addEventListener(MARK_READ_EVENT, handler);
    return () => window.removeEventListener(MARK_READ_EVENT, handler);
  }, [convIds, userId, supabase]);

  return total;
}
