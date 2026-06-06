"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { NotificationBell } from "@/components/layout/notification-bell";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

interface DashboardHeaderProps {
  userName: string;
  role: "admin" | "teacher" | "student";
  userId: string;
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
    { href: "/teacher/requests", label: "Requests" },
    { href: "/teacher/students", label: "Students" },
  ],
  student: [
    { href: "/student", label: "Overview" },
    { href: "/student/schedule", label: "Schedule" },
    { href: "/student/requests", label: "Proposals" },
    { href: "/student/teachers", label: "Teachers" },
  ],
};

export function DashboardHeader({ userName, role, userId }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [reminder24h, setReminder24h] = useState(true);
  const [reminderSaving, setReminderSaving] = useState(false);
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

  // Load reminder preferences
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("reminder_24h")
        .eq("id", userId)
        .single();
      if (data) {
        setReminder24h(data.reminder_24h ?? true);
      }
    };
    void load();
  }, [userId]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleResetPassword = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetError(null);
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords don't match.");
      return;
    }
    setResetLoading(true);
    const supabase = createClient();

    // Verify current password by re-authenticating
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      setResetError("Could not retrieve your account details.");
      setResetLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      setResetError("Current password is incorrect.");
      setResetLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) {
      setResetError(error.message);
      return;
    }
    setResetSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const openReset = () => {
    setDropdownOpen(false);
    setResetSuccess(false);
    setResetError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowResetModal(true);
  };

  const openReminders = () => {
    setDropdownOpen(false);
    setShowRemindersModal(true);
  };

  const handleReminderToggle = async (value: boolean) => {
    setReminder24h(value);
    setReminderSaving(true);
    await fetch("/api/user/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder_24h: value }),
    }).catch(() => {});
    setReminderSaving(false);
  };

  return (
    <>
      <header
        className="bg-surface"
        style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid var(--color-border)" }}
      >
        <div style={{ marginLeft: "auto", marginRight: "auto", width: "100%", maxWidth: "72rem" }}>
          <div
            className="px-6 py-4"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <Link href={`/${role}`} style={{ textDecoration: "none" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                Insight Academy
              </p>
              <p className="text-lg font-semibold text-navy">Dashboard</p>
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <NotificationBell userId={userId} />
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{userName}</p>
                <p className="text-xs text-muted">{roleLabels[role]}</p>
              </div>

              {/* Profile icon + dropdown */}
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  style={{
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
                  <User size={17} />
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
                      onClick={openReminders}
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
                      Reminders
                    </button>
                    <button
                      onClick={openReset}
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
                      Reset password
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

          <nav
            className="px-6"
            aria-label="Dashboard sections"
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "12px",
            }}
          >
            {roleNav[role].map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: "34px",
                    padding: "0 14px",
                    borderRadius: "9999px",
                    border: `1px solid ${active ? "var(--color-navy)" : "var(--color-border)"}`,
                    backgroundColor: active ? "var(--color-navy)" : "var(--color-surface)",
                    color: active ? "white" : "var(--color-slate)",
                    fontSize: "13px",
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Reminders modal */}
      {showRemindersModal && (
        <Modal
          title="Email reminders"
          description="Choose when to receive email reminders for upcoming sessions."
          onClose={() => setShowRemindersModal(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* 24h toggle */}
            <label
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "14px 16px", border: "1px solid var(--color-border)", borderRadius: "10px", background: "var(--color-soft)" }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-navy)" }}>24 hours before</p>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>Reminder sent the day before your session</p>
              </div>
              <button
                role="switch"
                aria-checked={reminder24h}
                disabled={reminderSaving}
                onClick={() => void handleReminderToggle(!reminder24h)}
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: reminderSaving ? "not-allowed" : "pointer",
                  background: reminder24h ? "var(--color-navy)" : "var(--color-border)",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: reminder24h ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </label>

            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>
              {reminderSaving ? "Saving…" : "Changes are saved automatically."}
            </p>
          </div>
        </Modal>
      )}

      {/* Reset password modal */}
      {showResetModal && (
        <Modal
          title="Reset password"
          description="Choose a new password for your account."
          onClose={() => setShowResetModal(false)}
        >
          {resetSuccess ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p className="text-sm" style={{ color: "#16a34a" }}>Password updated successfully.</p>
              <Button onClick={() => setShowResetModal(false)} style={{ width: "100%", justifyContent: "center" }}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>
              {resetError && <p className="text-sm text-error">{resetError}</p>}
              <Button type="submit" disabled={resetLoading} style={{ width: "100%", justifyContent: "center" }}>
                {resetLoading ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
