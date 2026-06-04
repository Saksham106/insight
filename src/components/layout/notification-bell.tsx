"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });

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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
    void markAsRead(notifications.filter((n) => !n.is_read).map((n) => n.id));
  };

  return (
    <div>
      <button
        onClick={handleClick}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "36px",
          width: "36px",
        }}
        className="rounded-md border border-border bg-background text-muted transition-colors hover:bg-soft"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-8px",
              right: "-8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "20px",
              width: "20px",
            }}
            className="rounded-full bg-navy text-[11px] font-bold text-white ring-2 ring-surface"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && pos.top > 0 && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 50,
              width: "320px",
            }}
            className="rounded-lg border border-border bg-surface shadow-xl"
          >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="text-sm font-semibold text-navy">Notifications</p>
            </div>
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  No notifications yet
                </p>
              ) : (
                notifications.map((n, index) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 ${n.is_read ? "opacity-60" : ""}`}
                    style={{
                      borderBottom:
                        index < notifications.length - 1
                          ? "1px solid var(--color-border)"
                          : undefined,
                    }}
                  >
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted">{n.body}</p>
                    <p className="text-[10px] text-muted" style={{ marginTop: "4px" }}>
                      {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}
                      {new Date(n.created_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
