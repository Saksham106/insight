"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUnread } from "@/lib/unread-context";

type Role = "admin" | "teacher" | "student" | "parent";

/** Server snapshot is false so SSR matches desktop (no bar); client resolves live. */
function useIsPhoneViewport() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 768px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 768px)").matches,
    () => false
  );
}

interface NavItem {
  href: string;
  label: string;
  isChats?: boolean;
}

const roleNavItems: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Home" },
    { href: "/admin/sessions", label: "Sessions" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/chats", label: "Chats", isChats: true },
  ],
  teacher: [
    { href: "/teacher", label: "Home" },
    { href: "/teacher/schedule", label: "Schedule" },
    { href: "/teacher/students", label: "Students" },
    { href: "/teacher/chats", label: "Chats", isChats: true },
  ],
  student: [
    { href: "/student", label: "Home" },
    { href: "/student/schedule", label: "Schedule" },
    { href: "/student/teachers", label: "Teachers" },
    { href: "/student/chats", label: "Chats", isChats: true },
  ],
  parent: [
    { href: "/parent", label: "Home" },
    { href: "/parent/schedule", label: "Schedule" },
    { href: "/parent/chats", label: "Chats", isChats: true },
  ],
};

/* Minimal inline stroke icons keep this client bundle tiny and dependency-free. */

function IconPath({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Icon({ name }: { name: string }) {
  const size = 22;
  switch (name) {
    case "home":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <IconPath d="M3 9.5 12 3l9 6.5" />
          <IconPath d="M5 8.5V21h14V8.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <IconPath d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <IconPath d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <IconPath d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
      );
    case "user":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
          <IconPath d="M20 21a8 8 0 1 0-16 0" />
        </svg>
      );
    case "chat":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <IconPath d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function itemIcon(item: NavItem): string {
  if (item.isChats) return "chat";
  if (item.label === "Schedule" || item.label === "Sessions") return "calendar";
  if (item.label === "Users") return "users";
  if (item.label === "Students" || item.label === "Teachers") return "user";
  return "home";
}

/**
 * Fixed bottom tab bar for phone widths (≤768px). Renders nothing on desktop,
 * where the header tabs stay the primary navigation. The Chats tab carries a
 * live unread badge from UnreadProvider.
 */
export function BottomNavigation({ role }: { role: Role }) {
  const pathname = usePathname();
  const isMobile = useIsPhoneViewport();
  const { total: unreadCount } = useUnread();

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "stretch",
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
      }}
    >
      {roleNavItems[role].map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              textDecoration: "none",
              color: active ? "var(--color-navy)" : "var(--color-ink-2)",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={itemIcon(item)} />
              {item.isChats && unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-5px",
                    right: "-8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "16px",
                    height: "16px",
                    padding: "0 4px",
                    borderRadius: "999px",
                    backgroundColor: "var(--color-error)",
                    color: "#fff",
                    fontSize: "9px",
                    fontWeight: 700,
                    border: "2px solid var(--color-surface)",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span style={{ fontSize: "10px", fontWeight: active ? 700 : 500, lineHeight: 1 }}>
              {item.label}
            </span>
            <span
              style={{
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                backgroundColor: active ? "var(--color-accent)" : "transparent",
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
