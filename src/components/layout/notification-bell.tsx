"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import type { Notification } from "@/lib/use-notifications";
import { PushNotificationControl } from "@/components/layout/push-notification-control";

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  onOpen?: () => void;
}

/**
 * Bell button + notification popover. On phone widths the popover becomes a
 * bottom sheet (thumb-reachable, iOS-like) instead of a dropdown.
 */
export function NotificationBell({ notifications, unreadCount, onOpen }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!isPhone) {
      const rect = e.currentTarget.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(true);
    onOpen?.();
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
          height: "38px",
          width: "38px",
        }}
        className="rounded-md border border-border bg-background text-muted transition-colors hover:bg-soft"
        aria-label={`${unreadCount} unread notifications`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-7px",
              right: "-7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "18px",
              minWidth: "18px",
              padding: "0 4px",
            }}
            className="rounded-full bg-error text-[10px] font-bold text-white ring-2 ring-surface"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (isPhone || pos.top > 0) && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={
              isPhone
                ? {
                    position: "fixed",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    maxHeight: "72vh",
                    overflowY: "auto",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    borderTopLeftRadius: "16px",
                    borderTopRightRadius: "16px",
                  }
                : {
                    position: "fixed",
                    top: pos.top,
                    right: pos.right,
                    zIndex: 50,
                    width: "320px",
                  }
            }
            className="border-border bg-surface shadow-xl"
          >
            <div
              className="px-4 py-3"
              style={{
                borderBottom: "1px solid var(--color-border)",
                // Keep the sheet header clear of the home indicator.
                paddingTop: isPhone ? "14px" : undefined,
                position: "sticky",
                top: 0,
                backgroundColor: "var(--color-surface)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <p className="text-sm font-semibold text-navy">Notifications</p>
              {isPhone && (
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    cursor: "pointer",
                    color: "var(--color-muted)",
                    fontSize: "13px",
                    fontWeight: 600,
                    minHeight: "44px",
                  }}
                >
                  Close
                </button>
              )}
            </div>
            <PushNotificationControl />
            <NotificationList notifications={notifications} />
          </div>
        </>
      )}
    </div>
  );
}

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  return (
    <div style={{ maxHeight: "60vh" }}>
      {notifications.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet</p>
      ) : (
        notifications.map((n, index) => (
          <div
            key={n.id}
            className={`px-4 py-3 ${n.is_read ? "opacity-60" : ""}`}
            style={{
              borderBottom: index < notifications.length - 1 ? "1px solid var(--color-border)" : undefined,
              minHeight: "44px",
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
  );
}
