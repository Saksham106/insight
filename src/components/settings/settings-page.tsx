"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Camera, CheckCircle, KeyRound, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type SettingsTab = "account" | "reminders" | "password";

interface SettingsPageProps {
  email: string;
  fullName: string;
  role: "admin" | "teacher" | "student";
  isActive: boolean;
  avatarUrl: string | null;
  reminder24h: boolean;
  timezone: string | null;
  createdAt: string | null;
}

const roleLabels: Record<SettingsPageProps["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student/Parent",
};

const tabs: { id: SettingsTab; label: string; icon: typeof UserRound }[] = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "password", label: "Password", icon: KeyRound },
];

export function SettingsPage({
  email,
  fullName,
  role,
  isActive,
  avatarUrl,
  reminder24h,
  timezone,
  createdAt,
}: SettingsPageProps) {
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [name, setName] = useState(fullName);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone ?? "");
  const [reminderState, setReminderState] = useState({
    reminder_24h: reminder24h,
  });
  const [reminderSaving, setReminderSaving] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (!timezone) {
      setSelectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [timezone]);


  const handleAccountSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountError(null);
    setAccountStatus(null);

    setAccountSaving(true);
    const response = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name }),
    });
    const data = await response.json().catch(() => ({}));
    setAccountSaving(false);

    if (!response.ok) {
      setAccountError((data as { error?: string }).error ?? "Could not update your account.");
      return;
    }

    setAccountStatus("Account updated.");
    router.refresh();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAccountError(null);
    setAccountStatus(null);
    setAvatarUploading(true);

    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch("/api/user/avatar", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    setAvatarUploading(false);
    event.target.value = "";

    if (!response.ok) {
      setAccountError((data as { error?: string }).error ?? "Could not upload your profile photo.");
      return;
    }

    setCurrentAvatarUrl((data as { avatarUrl: string }).avatarUrl);
    setAccountStatus("Profile photo updated.");
    router.refresh();
  };


  const handleReminderToggle = async (field: "reminder_24h", value: boolean) => {
    setReminderError(null);
    setReminderSaving(field);
    setReminderState((current) => ({ ...current, [field]: value }));

    const response = await fetch("/api/user/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });

    setReminderSaving(null);
    if (!response.ok) {
      setReminderState((current) => ({ ...current, [field]: !value }));
      setReminderError("Could not save reminder preferences.");
    }
  };

  const handlePasswordSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const accountEmail = userData.user?.email;

    if (!accountEmail) {
      setPasswordSaving(false);
      setPasswordError("Could not load your account email.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: accountEmail,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordSaving(false);
      setPasswordError("Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordSaving(false);
      setPasswordError(error.message);
      return;
    }

    // Retry once — if this write is missed the admin dashboard shows the wrong
    // onboarding status, but never block the user since their password is
    // already saved.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "password_set" }),
      }).catch(() => null);
      if (response?.ok) break;
    }

    setPasswordSaving(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate" style={{ marginBottom: "8px" }}>
            Insight Academy
          </p>
          <h1 className="text-navy" style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>
            Settings
          </h1>
          <p className="text-sm text-muted" style={{ marginTop: "6px" }}>
            Manage your account details, timezone, reminders, and password.
          </p>
        </div>
      </div>

      <div className="settings-layout" style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: "20px", alignItems: "start" }}>
        <Card>
          <CardContent style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    minHeight: "42px",
                    border: "1px solid transparent",
                    borderRadius: "8px",
                    padding: "0 12px",
                    background: active ? "rgba(27,53,96,0.08)" : "transparent",
                    color: active ? "var(--color-navy)" : "var(--color-slate)",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {activeTab === "account" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-navy">Account</CardTitle>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                Update your profile and review your account details.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccountSave} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
                  <div
                    style={{
                      width: "82px",
                      height: "82px",
                      borderRadius: "50%",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      color: "var(--color-navy)",
                    }}
                  >
                    {currentAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currentAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <UserRound size={30} />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                      <Camera size={16} />
                      {avatarUploading ? "Uploading..." : "Change photo"}
                    </Button>
                    <p className="text-sm text-muted" style={{ margin: 0 }}>
                      JPG, PNG, or WebP. 2 MB max.
                    </p>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <Label htmlFor="settings-name">Account name</Label>
                    <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <Label htmlFor="settings-email">Email</Label>
                    <Input id="settings-email" type="email" value={email} disabled />
                  </div>
                </div>

                {accountError ? <p className="text-sm text-error">{accountError}</p> : null}
                {accountStatus ? <StatusMessage>{accountStatus}</StatusMessage> : null}

                <Button type="submit" disabled={accountSaving} style={{ width: "fit-content" }}>
                  {accountSaving ? "Saving..." : "Save account"}
                </Button>
              </form>

              <section style={{ marginTop: "28px", paddingTop: "24px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <h2 className="text-navy" style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                    Timezone
                  </h2>
                  <p className="text-sm text-muted" style={{ margin: "4px 0 0" }}>
                    Auto-detected from your browser. Used for calendar displays and reminder timing.
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
                  <Label htmlFor="settings-timezone">Timezone</Label>
                  <Input id="settings-timezone" value={selectedTimezone} disabled />
                </div>
              </section>

              <section style={{ marginTop: "28px", paddingTop: "24px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <h2 className="text-navy" style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                    Account details
                  </h2>
                  <p className="text-sm text-muted" style={{ margin: "4px 0 0" }}>
                    These details are managed by Insight Academy.
                  </p>
                </div>
                <div className="form-grid-2">
                  <InfoRow label="Role" value={roleLabels[role]} />
                  <InfoRow label="Status" value={isActive ? "Active" : "Inactive"} />
                  <InfoRow label="Email" value={email || "Not available"} />
                  <InfoRow label="Member since" value={formatDate(createdAt)} />
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {activeTab === "reminders" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-navy">Reminders</CardTitle>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                Choose when email reminders are sent for upcoming sessions.
              </p>
            </CardHeader>
            <CardContent style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <ReminderToggle
                title="24 hours before"
                description="Reminder sent the day before your session."
                checked={reminderState.reminder_24h}
                disabled={reminderSaving === "reminder_24h"}
                onChange={(value) => void handleReminderToggle("reminder_24h", value)}
              />
              {reminderError ? <p className="text-sm text-error">{reminderError}</p> : null}
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                {reminderSaving ? "Saving changes..." : "Changes are saved automatically."}
              </p>
            </CardContent>
          </Card>
        )}

        {activeTab === "password" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-navy">Password</CardTitle>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                Change the password you use to sign in.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSave} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "28rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="current-password">Current password</Label>
                  <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
                </div>
                {passwordError ? <p className="text-sm text-error">{passwordError}</p> : null}
                {passwordSuccess ? <StatusMessage>Password updated.</StatusMessage> : null}
                <Button type="submit" disabled={passwordSaving} style={{ width: "fit-content" }}>
                  {passwordSaving ? "Updating..." : "Update password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReminderToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "16px",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: "var(--color-soft)",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-navy)" }}>
          {title}
        </p>
        <p className="text-sm text-muted" style={{ margin: "4px 0 0" }}>
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "9999px",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          background: checked ? "var(--color-navy)" : "var(--color-border)",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#16a34a", margin: 0 }}>
      <CheckCircle size={15} />
      {children}
    </p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-soft)" }}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate" style={{ margin: 0 }}>
        {label}
      </p>
      <p className="text-sm text-foreground" style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}>
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
