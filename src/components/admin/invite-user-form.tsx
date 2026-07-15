"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "teacher" | "student" | "parent";

const ROLES: { value: Role; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

export function InviteUserForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error">("success");
  const [pendingResend, setPendingResend] = useState<{ email: string; fullName: string; role: Role } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setPendingResend(null);
    setGeneratedPassword(null);
    setLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 409 && data.alreadyActive) {
      setStatusType("warning");
      setStatus(data.error ?? "This user already has an active account and can log in directly.");
      return;
    }

    if (response.status === 409 && data.alreadyInvited) {
      setPendingResend({ email, fullName, role });
      setStatusType("warning");
      setStatus("This user was invited but hasn't logged in yet.");
      return;
    }

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to send invite.");
      return;
    }

    if (data.emailError) {
      setStatusType("warning");
      setStatus("Account created, but the email failed to send. Share the password below manually.");
    } else {
      setStatusType("success");
      setStatus("Account created and credentials emailed.");
    }
    setGeneratedPassword(data.password ?? null);
    setFullName("");
    setEmail("");
    router.refresh();
  };

  const handleResend = async () => {
    if (!pendingResend) return;
    setResendLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pendingResend, resend: true }),
    });

    const data = await response.json();
    setResendLoading(false);
    setPendingResend(null);

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to resend credentials.");
      return;
    }

    if (data.emailError) {
      setStatusType("warning");
      setStatus("Credentials reset, but the email failed to send. Share the password below manually.");
    } else {
      setStatusType("success");
      setStatus("Credentials resent.");
    }
    setGeneratedPassword(data.password ?? null);
  };

  const statusColor = statusType === "error" ? "text-error" : statusType === "warning" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite user</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-role">Role</Label>
            <div
              id="invite-role"
              role="group"
              aria-label="Role"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              {ROLES.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRole(option.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: selected ? "1px solid var(--color-navy)" : "1px solid var(--color-border)",
                      background: selected ? "var(--color-navy)" : "var(--color-surface)",
                      color: selected ? "#ffffff" : "var(--color-navy)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {status ? <p className={`text-sm ${statusColor}`}>{status}</p> : null}
          {generatedPassword ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
              }}
            >
              <p className="text-sm" style={{ margin: 0 }}>
                If the email doesn&apos;t arrive, share this password directly:{" "}
                <strong style={{ fontFamily: "monospace" }}>{generatedPassword}</strong>
              </p>
              <button
                type="button"
                onClick={() => setGeneratedPassword(null)}
                className="text-sm text-muted"
                style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {pendingResend ? (
            <Button
              type="button"
              variant="outline"
              disabled={resendLoading}
              onClick={handleResend}
            >
              {resendLoading ? "Resending..." : "Resend credentials"}
            </Button>
          ) : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
