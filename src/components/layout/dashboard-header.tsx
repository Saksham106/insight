"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useMediaQuery } from "@/lib/use-media-query";

import { NotificationBell } from "@/components/layout/notification-bell";
import { useNotifications } from "@/lib/use-notifications";
import { useChatUnreadTotal } from "@/lib/use-chat-unread-total";
import { createClient } from "@/lib/supabase/client";

interface DashboardHeaderProps {
  userName: string;
  role: "admin" | "teacher" | "student" | "parent";
  userId: string;
  avatarUrl?: string | null;
}

const roleLabels: Record<DashboardHeaderProps["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student/Parent",
  parent: "Parent",
};

const roleNav: Record<DashboardHeaderProps["role"], { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/sessions", label: "Sessions" },
    { href: "/admin/chats", label: "Chats" },
  ],
  teacher: [
    { href: "/teacher", label: "Overview" },
    { href: "/teacher/schedule", label: "Schedule" },
    { href: "/teacher/students", label: "Students" },
    { href: "/teacher/chats", label: "Chats" },
  ],
  student: [
    { href: "/student", label: "Overview" },
    { href: "/student/schedule", label: "Schedule" },
    { href: "/student/teachers", label: "Teachers" },
    { href: "/student/chats", label: "Chats" },
  ],
  parent: [
    { href: "/parent", label: "Overview" },
    { href: "/parent/schedule", label: "Schedule" },
    { href: "/parent/chats", label: "Chats" },
  ],
};

export function DashboardHeader({ userName, role, userId, avatarUrl }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { notifications, unreadCount, markAllRead } = useNotifications(userId);
  const chatUnread = useChatUnreadTotal();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const openSettings = () => {
    setDropdownOpen(false);
    router.push("/settings");
  };

  return (
    <>
      <header
        className="bg-surface"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          borderBottom: "1px solid var(--color-border)",
          overflow: "visible",
          // With viewport-fit=cover the page extends under the notch/status
          // bar; pad the header down so nothing lands in un-tappable territory.
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div style={{ marginLeft: "auto", marginRight: "auto", width: "100%", maxWidth: "72rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              paddingLeft: isMobile ? "16px" : undefined,
              paddingRight: isMobile ? "12px" : undefined,
              paddingTop: "10px",
              paddingBottom: "10px",
            }}
          >
            {/* Left: branding */}
            <Link href={`/${role}`} style={{ textDecoration: "none", flexShrink: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "16px",
                  letterSpacing: "-0.02em",
                  color: "var(--color-ink)",
                }}
              >
                Insight&nbsp;Academy
              </p>
              <p className="text-xs" style={{ margin: 0, color: "var(--color-muted)", display: isMobile ? "none" : undefined }}>Dashboard</p>
            </Link>

            {/* Center: nav tabs (desktop only) */}
            {!isMobile && (
              <nav style={{ display: "flex", gap: "0", flex: 1, justifyContent: "center" }}>
                {roleNav[role].map((item) => {
                  const active = pathname === item.href;
                  const isChats = item.label === "Chats";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        height: "40px",
                        padding: "0 14px",
                        color: active ? "var(--color-ink)" : "var(--color-ink-2)",
                        fontSize: "13px",
                        fontWeight: active ? 600 : 500,
                        textDecorationLine: active ? "underline" : "none",
                        textDecorationColor: "var(--color-accent)",
                        textDecorationThickness: "2px",
                        textUnderlineOffset: "6px",
                        whiteSpace: "nowrap",
                        transition: "color 0.15s",
                      }}
                    >
                      {item.label}
                      {isChats && chatUnread > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 4px", fontSize: "11px", fontWeight: 700, backgroundColor: "var(--color-error)", color: "white" }}>
                          {chatUnread > 99 ? "99+" : chatUnread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Spacer on mobile */}
            {isMobile && <div style={{ flex: 1 }} />}

            {/* Right: bell + name + profile */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <NotificationBell
                notifications={notifications}
                unreadCount={unreadCount}
                onOpen={markAllRead}
              />
              {!isMobile && (
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{userName}</p>
                  <p className="text-xs text-muted">{roleLabels[role]}</p>
                </div>
              )}

              {/* Profile icon + dropdown */}
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  aria-label="Open profile menu"
                  style={{
                    position: "relative",
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: "1px solid var(--color-border)",
                    backgroundColor: dropdownOpen ? "var(--color-soft)" : "var(--color-surface)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-navy)",
                    padding: 0,
                    overflow: "hidden",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <User size={17} />
                  )}
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      minWidth: "160px",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "10px",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                      overflow: "hidden",
                      zIndex: 50,
                    }}
                  >
                    <button
                      onClick={openSettings}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "11px 16px",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "var(--color-foreground)",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Settings
                    </button>
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "11px 16px",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "var(--color-error)",
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </header>
    </>
  );
}
