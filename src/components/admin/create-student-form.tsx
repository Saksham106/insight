"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error">("success");
  const [pendingResend, setPendingResend] = useState<{ email: string; fullName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setPendingResend(null);
    setLoading(true);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role: "student" }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 409 && data.alreadyActive) {
      setStatusType("warning");
      setStatus(data.error ?? "This user already has an active account and can log in directly.");
      return;
    }

    if (response.status === 409 && data.alreadyInvited) {
      setPendingResend({ email, fullName });
      setStatusType("warning");
      setStatus("This user has already been invited but hasn't completed registration.");
      return;
    }

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to invite student.");
      return;
    }

    setStatusType("success");
    setStatus("Invite sent.");
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
      body: JSON.stringify({ ...pendingResend, role: "student", resend: true }),
    });

    const data = await response.json();
    setResendLoading(false);
    setPendingResend(null);

    if (!response.ok) {
      setStatusType("error");
      setStatus(data.error ?? "Failed to resend invite.");
      return;
    }

    setStatusType("success");
    setStatus("Invite resent.");
  };

  const statusColor = statusType === "error" ? "text-error" : statusType === "warning" ? "text-warning" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-navy">Invite student/parent</CardTitle>
      </CardHeader>
      <CardContent>
        <form style={{ display: "flex", flexDirection: "column", gap: "12px" }} onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {status ? <p className={`text-sm ${statusColor}`}>{status}</p> : null}
          {pendingResend ? (
            <Button
              type="button"
              variant="outline"
              disabled={resendLoading}
              onClick={handleResend}
            >
              {resendLoading ? "Resending..." : "Resend invite"}
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
