"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data ?? []);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unread);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return { notifications, unreadCount, markAllRead };
}
