"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import type { Notification } from "@/lib/use-notifications";
import { NotificationList } from "@/components/layout/notification-list";

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  onOpen?: () => void;
}

export function NotificationBell({ notifications, unreadCount, onOpen }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
    onOpen?.();
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "36px",
          width: "36px",
          borderRadius: "999px",
          backgroundColor: unreadCount > 0 ? "var(--color-accent-soft)" : "var(--color-surface)",
          border: "1px solid var(--color-border)",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        aria-label={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
      >
        <Bell
          size={18}
          style={{
            color: unreadCount > 0 ? "var(--color-navy)" : "var(--color-ink-2)",
          }}
        />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "16px",
              width: "16px",
              borderRadius: "50%",
              backgroundColor: "var(--color-error)",
              color: "white",
              fontSize: "9px",
              fontWeight: 700,
              border: "2px solid var(--color-surface)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 50,
              width: "320px",
              maxHeight: "400px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-navy)",
                }}
              >
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpen?.();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--color-accent)",
                    fontWeight: 500,
                    padding: "4px",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <NotificationList notifications={notifications} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
