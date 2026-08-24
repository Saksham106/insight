"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  session_id: string | null;
}

export function useNotifications(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    const [{ data }, { data: preferences }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, title, body, is_read, created_at, session_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("profiles")
        .select("notify_session_changes")
        .eq("id", userId)
        .single(),
    ]);
    const showSessionChanges = preferences?.notify_session_changes !== false;
    setNotifications((data ?? []).filter((notification) => showSessionChanges || notification.session_id === null));
  }, [supabase, userId]);

  useEffect(() => {
    const reloadPreferences = () => void load();
    window.addEventListener("insight-notification-preferences-changed", reloadPreferences);
    return () => window.removeEventListener("insight-notification-preferences-changed", reloadPreferences);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load, supabase, userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unread);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return { notifications, unreadCount, markAllRead };
}
