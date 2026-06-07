"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, User, X as XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useMediaQuery } from "@/lib/use-media-query";

import { NotificationBell, NotificationList } from "@/components/layout/notification-bell";
import { Modal } from "@/components/ui/modal";
import { useNotifications } from "@/lib/use-notifications";
import { useChatUnreadTotal } from "@/lib/use-chat-unread-total";
import { createClient } from "@/lib/supabase/client";

interface DashboardHeaderProps {
  userName: string;
  role: "admin" | "teacher" | "student";
  userId: string;
  avatarUrl?: string | null;
}

const roleLabels: Record<DashboardHeaderProps["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student/Parent",
};

const roleNav: Record<DashboardHeaderProps["role"], { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/assignments", label: "Assignments" },
    { href: "/admin/sessions", label: "Sessions" },
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
};

export function DashboardHeader({ userName, role, userId, avatarUrl }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { notifications, unreadCount, markAllRead } = useNotifications(userId);
  const chatUnread = useChatUnreadTotal(userId, role);
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

  const openNotifications = () => {
    setDropdownOpen(false);
    void markAllRead();
    setShowNotificationsModal(true);
  };

  return (
    <>
      <header
        className="bg-surface"
        style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid var(--color-border)", overflow: "visible" }}
      >
        <div style={{ marginLeft: "auto", marginRight: "auto", width: "100%", maxWidth: "72rem" }}>
          <div
            className="px-6 py-3"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* Left: branding */}
            <Link href={`/${role}`} style={{ textDecoration: "none", flexShrink: 0 }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                Insight Academy
              </p>
              <p className="text-lg font-semibold text-navy">Dashboard</p>
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
                        color: active ? "var(--color-navy)" : "var(--color-slate)",
                        fontSize: "13px",
                        fontWeight: active ? 600 : 500,
                        textDecorationLine: active ? "underline" : "none",
                        textDecorationColor: "var(--color-navy)",
                        textDecorationThickness: "2px",
                        textUnderlineOffset: "6px",
                        whiteSpace: "nowrap",
                        transition: "color 0.15s",
                      }}
                    >
                      {item.label}
                      {isChats && chatUnread > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 4px", fontSize: "11px", fontWeight: 700, backgroundColor: "#ef4444", color: "white" }}>
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

            {/* Right: mobile menu + bell + name + profile */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              {/* Mobile hamburger */}
              {isMobile && (
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "var(--color-navy)",
                    display: "flex",
                    alignItems: "center",
                  }}
                  aria-label="Toggle navigation menu"
                >
                  {menuOpen ? <XIcon size={20} /> : <Menu size={20} />}
                </button>
              )}

              {!isMobile && (
                <NotificationBell
                  notifications={notifications}
                  unreadCount={unreadCount}
                  onOpen={markAllRead}
                />
              )}
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{userName}</p>
                <p className="text-xs text-muted">{roleLabels[role]}</p>
              </div>

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
                  {isMobile && unreadCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "18px",
                        width: "18px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-navy)",
                        color: "#fff",
                        fontSize: "10px",
                        fontWeight: 700,
                        border: "2px solid var(--color-surface)",
                      }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
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
                    {isMobile && (
                      <button
                        onClick={openNotifications}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
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
                        <span>Notifications</span>
                        {unreadCount > 0 && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "20px",
                              minWidth: "20px",
                              padding: "0 4px",
                              borderRadius: "9999px",
                              backgroundColor: "var(--color-navy)",
                              color: "#fff",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </button>
                    )}
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
                        color: "#dc2626",
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile dropdown menu — overlays page content, animated */}
          {isMobile && (
            <>
              {/* Backdrop — closes menu on tap outside */}
              {menuOpen && (
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 28,
                  }}
                />
              )}
              <nav
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  backgroundColor: "var(--color-surface)",
                  borderBottom: menuOpen ? "1px solid var(--color-border)" : "none",
                  boxShadow: menuOpen ? "0 8px 24px rgba(0,0,0,0.08)" : "none",
                  zIndex: 29,
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? "translateY(0)" : "translateY(-6px)",
                  pointerEvents: menuOpen ? "auto" : "none",
                  transition: "opacity 0.2s ease, transform 0.2s ease",
                  padding: menuOpen ? "8px 0" : "0",
                }}
              >
                {roleNav[role].map((item) => {
                  const active = pathname === item.href;
                  const isChats = item.label === "Chats";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 24px",
                        fontSize: "14px",
                        fontWeight: active ? 600 : 500,
                        color: active ? "var(--color-navy)" : "var(--color-slate)",
                        backgroundColor: active ? "rgba(27,53,96,0.06)" : "transparent",
                        textDecoration: "none",
                        borderLeft: active ? "3px solid var(--color-navy)" : "3px solid transparent",
                      }}
                    >
                      {item.label}
                      {isChats && chatUnread > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "20px", height: "20px", borderRadius: "9999px", padding: "0 4px", fontSize: "11px", fontWeight: 700, backgroundColor: "#ef4444", color: "white" }}>
                          {chatUnread > 99 ? "99+" : chatUnread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>
      </header>

      {/* Notifications modal (mobile only) */}
      {showNotificationsModal && (
        <Modal
          title="Notifications"
          onClose={() => setShowNotificationsModal(false)}
        >
          <NotificationList notifications={notifications} />
        </Modal>
      )}
    </>
  );
}
