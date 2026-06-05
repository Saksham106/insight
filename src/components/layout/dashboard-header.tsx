"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";

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

export function DashboardHeader({ userName, role, userId }: DashboardHeaderProps) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
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

  return (
    <>
      <header
        className="bg-surface"
        style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid var(--color-border)" }}
      >
        <div
          className="px-6 py-4"
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            width: "100%",
            maxWidth: "72rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
              Insight Tutors
            </p>
            <p className="text-lg font-semibold text-navy">Dashboard</p>
          </div>

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
      </header>

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
