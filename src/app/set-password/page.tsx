"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const roleRedirects: Record<string, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
  parent: "/parent",
};

export default function SetPasswordPage() {
  const router = useRouter();
  const [accountEmail, setAccountEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();

      // Detect error redirected back from Supabase (e.g. expired invite OTP)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashErrorCode = hashParams.get("error_code");
      const hashErrorDescription = hashParams.get("error_description");
      if (hashErrorCode) {
        window.history.replaceState({}, "", window.location.pathname);
        setError(
          hashErrorCode === "otp_expired"
            ? "This invite link has expired. Please ask your administrator to resend the invite."
            : hashErrorDescription ?? "This invite link could not be used. Please ask your administrator for a new invite.",
        );
        setReady(true);
        return;
      }

      // Exchange PKCE code when invite link points directly here
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        window.history.replaceState({}, "", window.location.pathname);
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError("This invite link could not be used. Please ask your administrator to resend the invite.");
          setReady(true);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      setHasSession(Boolean(user));
      setAccountEmail(user?.email ?? "");

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        setFullName(profile?.full_name ?? "");
      }

      setReady(true);
    };

    void checkSession();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      setError("Session not found. Please log in again.");
      setLoading(false);
      return;
    }

    // Retry once — if this write is missed the admin dashboard shows the wrong
    // status, but never block the user since their password is already saved.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "password_set" }),
      }).catch(() => null);
      if (response?.ok) break;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role && roleRedirects[profile.role]) {
      router.replace(roleRedirects[profile.role]);
      return;
    }

    router.replace("/login");
  };

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", backgroundColor: "var(--color-paper-2)", padding: "24px" }}
    >

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "26rem" }}>
        <Card>
          <CardHeader style={{ padding: "36px 32px 0", textAlign: "center", alignItems: "center" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-slate)", margin: "0 0 10px" }}>
              Insight Academy
            </p>
            <CardTitle className="text-navy" style={{ fontSize: "22px", lineHeight: 1.2 }}>
              Set your password
            </CardTitle>
            <p className="text-sm text-muted" style={{ margin: "6px 0 0" }}>
              {fullName ? `Hi ${fullName}, finish setting up your account.` : "Finish setting up your account."}
            </p>
          </CardHeader>
          <CardContent style={{ padding: "28px 32px 32px" }}>
            {!ready ? (
              <p className="text-sm text-muted" style={{ textAlign: "center" }}>Checking your invite link...</p>
            ) : !hasSession ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} className="text-sm text-muted">
                <p style={{ margin: 0, textAlign: "center" }}>
                  Please open the invite email link to set your password. This
                  page only works after accepting an invite.
                </p>
                <Button variant="outline" onClick={() => router.push("/login")}>
                  Back to login
                </Button>
              </div>
            ) : (
              <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="accountEmail">Email</Label>
                  <Input
                    id="accountEmail"
                    name="accountEmail"
                    type="email"
                    value={accountEmail}
                    disabled
                    aria-readonly="true"
                    style={{ borderRadius: "8px" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    style={{ borderRadius: "8px" }}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    style={{ borderRadius: "8px" }}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" disabled={loading} style={{ marginTop: "8px", borderRadius: "8px" }}>
                  {loading ? "Saving..." : "Save password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
