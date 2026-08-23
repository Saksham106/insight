"use client";

import { useState, useEffect } from "react";
import { useUnread } from "@/lib/unread-context";
import type { Notification } from "@/lib/use-notifications";
import { NotificationItem } from "@/components/layout/notification-item";

interface NotificationListProps {
  notifications: Notification[];
}

export function NotificationList({ notifications }: NotificationListProps) {
  const { markAsRead } = useUnread();
  const [displayed, setDisplayed] = useState(notifications);

  useEffect(() => {
    const unreadIds = notifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);

    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => {
        markAsRead(id);
      });
    }

    setDisplayed(
      notifications.map((n) => ({ ...n, is_read: true }))
    );
  }, [notifications, markAsRead]);

  if (displayed.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--color-muted)",
          fontSize: "14px",
        }}
      >
        <p style={{ margin: 0 }}>No notifications yet</p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxHeight: "400px",
        overflowY: "auto",
        backgroundColor: "transparent",
      }}
    >
      {displayed.map((n) => (
        <NotificationItem
          key={n.id}
          notification={{
            id: n.id,
            type: n.id.startsWith("chat:") ? ("chat" as const) : n.id.startsWith("session:") ? ("session" as const) : ("system" as const),
            title: n.title,
            body: n.body,
            createdAt: n.created_at,
            isRead: n.is_read,
            link: n.id.startsWith("chat:") ? `/${encodeURIComponent(n.id.slice(5))}` : n.id.startsWith("session:") ? `/schedule/${n.id.slice(8)}` : undefined,
          }}
        />
      ))}
    </div>
  );
}
