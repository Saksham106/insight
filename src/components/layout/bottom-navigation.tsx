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

function IconPath({ d, opacity }: { d: string; opacity?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

function Icon({ name, filled }: { name: string; filled?: boolean }) {
  const size = 24;
  switch (name) {
    case "home":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          {filled ? (
            <path
              d="M3.5 9.7 12 3l8.5 6.7V21h-6v-6h-5v6h-6z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <IconPath d="M3 9.5 12 3l9 6.5" />
              <IconPath d="M5 8.5V21h14V8.5" />
            </>
          )}
        </svg>
      );
    case "calendar":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect
            x="3"
            y="4"
            width="18"
            height="18"
            rx="2"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <IconPath d="M16 2v4M8 2v4M3 10h18" opacity={filled ? 0.35 : 1} />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          {filled ? (
            <>
              <circle cx="9" cy="7.5" r="4" fill="currentColor" />
              <path d="M2.5 21a6.5 6.5 0 0 1 13 0z" fill="currentColor" />
            </>
          ) : (
            <>
              <IconPath d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <IconPath d="M22 21v-2a4 4 0 0 0-3-3.87" />
            </>
          )}
          <IconPath d="M16 3.6a4 4 0 0 1 0 7.75" opacity={filled ? 0.55 : 0.85} />
        </svg>
      );
    case "user":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          {filled ? (
            <>
              <circle cx="12" cy="8" r="5" fill="currentColor" />
              <path d="M4 21a8 8 0 0 1 16 0z" fill="currentColor" />
            </>
          ) : (
            <>
              <circle cx="12" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <IconPath d="M20 21a8 8 0 1 0-16 0" />
            </>
          )}
        </svg>
      );
    case "chat":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
 * Fixed bottom tab bar for phone widths (≤768px), styled after iOS tab bars:
 * translucent blurred surface, filled icon + bold label for the active tab,
 * ≥44px touch targets, and a live unread badge on the Chats tab.
 * Renders nothing on desktop, where the header tabs stay primary navigation.
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
        backgroundColor: "color-mix(in oklab, var(--color-surface) 88%, transparent)",
        backdropFilter: "saturate(180%) blur(16px)",
        WebkitBackdropFilter: "saturate(180%) blur(16px)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "stretch",
        height: "calc(64px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {roleNavItems[role].map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const color = active ? "var(--color-navy)" : "var(--color-muted)";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              minWidth: "44px",
              minHeight: "44px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              textDecoration: "none",
              color,
              WebkitTapHighlightColor: "transparent",
              transition: "color 150ms ease, transform 120ms ease",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex", padding: "2px" }}>
              <Icon name={itemIcon(item)} filled={active} />
              {item.isChats && unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-10px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "17px",
                    height: "17px",
                    padding: "0 4px",
                    borderRadius: "999px",
                    backgroundColor: "var(--color-error)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    border: "2px solid var(--color-surface)",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span style={{ fontSize: "10px", fontWeight: active ? 700 : 500, letterSpacing: "0.01em" }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
