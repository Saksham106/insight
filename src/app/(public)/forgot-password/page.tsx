"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  };

  return (
    <div
      className="px-6"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-paper-2)" }}
    >
      <Card style={{ width: "100%", maxWidth: "28rem" }}>
        <CardHeader>
          <CardTitle className="text-navy">Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p className="text-sm text-muted">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly. Check your inbox.
              </p>
              <Button asChild variant="outline">
                <Link href="/login">Back to log in</Link>
              </Button>
            </div>
          ) : (
            <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
              <p className="text-sm text-muted">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/login"
                className="text-sm text-muted"
                style={{ textAlign: "center", textDecoration: "none" }}
              >
                Back to log in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
