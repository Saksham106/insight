"use client";

import { useUnread } from "@/lib/unread-context";
import { useRouter } from "next/navigation";

interface NotificationItemProps {
  notification: {
    id: string;
    type: "chat" | "session" | "system";
    title: string;
    body: string;
    createdAt: string;
    isRead: boolean;
    link?: string;
  };
  onPress?: (n: NotificationItemProps["notification"]) => void;
}

export function NotificationItem({ notification, onPress }: NotificationItemProps) {
  const router = useRouter();
  const { markAsRead } = useUnread();
  const unread = !notification.isRead;

  const handleClick = () => {
    if (onPress) {
      onPress(notification);
      return;
    }
    if (notification.link) {
      if (notification.type === "chat" && notification.id.startsWith("chat:")) {
        markAsRead(notification.id.replace("chat:", ""));
      }
      router.push(notification.link);
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 16px",
        textAlign: "left",
        width: "100%",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--color-border)",
        cursor: "pointer",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: unread ? "var(--color-navy)" : "var(--color-foreground)",
            }}
          >
            {notification.title}
          </span>
          {unread && (
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
                flexShrink: 0,
              }}
            />
          )}
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--color-ink-2)",
            margin: 0,
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {notification.body}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "var(--color-muted)",
            marginTop: "4px",
          }}
        >
          {new Date(notification.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
      {unread && (
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "var(--color-accent)",
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}
