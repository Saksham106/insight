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
      className="bg-background px-6"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Card style={{ width: "100%", maxWidth: "28rem" }}>
        <CardHeader>
          <CardTitle className="text-navy">Set your password</CardTitle>
          {fullName ? (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Hi {fullName}, finish setting up your account.
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted">Checking your invite link...</p>
          ) : !hasSession ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} className="text-sm text-muted">
              <p>
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
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
