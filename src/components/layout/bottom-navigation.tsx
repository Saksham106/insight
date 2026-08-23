"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMediaQuery } from "@/lib/use-media-query";

/* Inline SVG icons — no dynamic imports, safe for a client component. */

function IconHome({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 8.5V21h14V8.5" />
    </svg>
  );
}

function IconUsers({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCalendar({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconCheckCircle({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconUserRound({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
}

function IconMessageSquare({ size = 22, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

type Role = "admin" | "teacher" | "student" | "parent";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { size?: number; color?: string }) => React.ReactElement;
  isChats?: boolean;
}

const roleNavItems: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Home", icon: IconHome },
    { href: "/admin/users", label: "Users", icon: IconUsers },
    { href: "/admin/sessions", label: "Sessions", icon: IconCalendar },
    { href: "/admin/chats", label: "Chats", icon: IconMessageSquare, isChats: true },
  ],
  teacher: [
    { href: "/teacher", label: "Home", icon: IconHome },
    { href: "/teacher/schedule", label: "Schedule", icon: IconCalendar },
    { href: "/teacher/students", label: "Students", icon: IconUserRound },
    { href: "/teacher/chats", label: "Chats", icon: IconMessageSquare, isChats: true },
  ],
  student: [
    { href: "/student", label: "Home", icon: IconHome },
    { href: "/student/schedule", label: "Schedule", icon: IconCalendar },
    { href: "/student/teachers", label: "Teachers", icon: IconUserRound },
    { href: "/student/chats", label: "Chats", icon: IconMessageSquare, isChats: true },
  ],
  parent: [
    { href: "/parent", label: "Home", icon: IconHome },
    { href: "/parent/schedule", label: "Schedule", icon: IconCalendar },
    { href: "/parent/chats", label: "Chats", icon: IconMessageSquare, isChats: true },
  ],
};

interface BottomNavigationProps {
  role: Role;
  unreadCount: number;
}

// Fixed bottom tab bar for phone widths. Desktop renders nothing — the header
// tabs remain the desktop navigation. Active state matches the header's ink
// treatment; the Chats tab carries the live unread badge.
export function BottomNavigation({ role, unreadCount }: BottomNavigationProps) {
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Avoid a hydration flash: server render is desktop (null) and the bar
  // appears on the client only after the media query resolves.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isMobile || !mounted) return null;

  const items = roleNavItems[role];

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
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        const color = active ? "var(--color-navy)" : "var(--color-ink-2)";
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
              color,
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon size={22} color={color} />
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
            {/* Active indicator dot */}
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
