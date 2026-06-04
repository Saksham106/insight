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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      if (typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          window.history.replaceState({}, document.title, window.location.pathname);

          if (type === "invite" || type === "recovery") {
            router.replace("/set-password");
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single();

        if (profile?.role && roleRedirects[profile.role]) {
          router.replace(roleRedirects[profile.role]);
        }
      }
    };

    void checkSession();
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("Unable to sign in.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile?.role) {
      setError("Unable to load your account profile.");
      setLoading(false);
      return;
    }

    router.replace(roleRedirects[profile.role]);
  };

  return (
    <div
      className="bg-background px-6"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Card style={{ width: "100%", maxWidth: "28rem" }}>
        <CardHeader>
          <CardTitle className="text-navy">Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Log in"}
            </Button>
          </form>
          <div
            className="text-sm text-muted"
            style={{ marginTop: "16px", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}
          >
            <p>New user?</p>
            <Button variant="outline" style={{ marginTop: "8px", width: "100%" }} asChild>
              <a href="/set-password">Set your password from invite</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
