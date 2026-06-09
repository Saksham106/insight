"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JoinInterestModal } from "@/components/landing/join-interest-modal";
import { createClient } from "@/lib/supabase/client";

const roleRedirects: Record<string, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

export default function LoginPage() {
  const router = useRouter();
  const checkedSessionRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      if (checkedSessionRef.current) return;
      checkedSessionRef.current = true;

      const supabase = createClient();
      if (typeof window !== "undefined") {
        const queryParams = new URLSearchParams(window.location.search);
        const authFlow = queryParams.get("auth_flow");
        const code = queryParams.get("code");
        const clearUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

        if (authFlow === "invite" && code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          clearUrl();

          if (exchangeError) {
            setError("This invite link could not be used. Please ask your administrator to resend the invite.");
            return;
          }

          router.replace("/set-password");
          return;
        }
      }

      if (typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const authError = params.get("error");
        const authErrorCode = params.get("error_code");
        const authErrorDescription = params.get("error_description");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (authError) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setError(
            authErrorCode === "otp_expired"
              ? "This invite link has expired. Please ask your administrator to resend the invite."
              : authErrorDescription ?? "This invite link could not be used. Please ask your administrator for a new invite.",
          );
          return;
        }

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          window.history.replaceState({}, document.title, window.location.pathname);

          if (!type || type === "invite" || type === "recovery") {
            router.replace("/set-password");
            return;
          }
        }
      }

      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await response.json().catch(() => null) as {
        authenticated?: boolean;
        role?: string;
      } | null;

      if (session?.authenticated && session.role && roleRedirects[session.role]) {
        router.replace(roleRedirects[session.role]);
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
      className="bg-background"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: "24px" }}
    >
      {/* Blue tint blob */}
      <div aria-hidden style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "900px", height: "700px", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(18,48,74,0.165) 0%, transparent 68%)", pointerEvents: "none" }} />
      {/* Grid with oval mask */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(18,48,74,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(18,48,74,0.13) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse 62% 78% at 50% 50%, black 35%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 62% 78% at 50% 50%, black 35%, transparent 75%)", pointerEvents: "none" }} />

      {/* Card — single centered element so it sits perfectly in the middle */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "26rem", display: "flex", flexDirection: "column", gap: "14px" }}>
        <Button
          asChild
          variant="outline"
          size="sm"
          style={{ width: "fit-content", borderRadius: "9999px", backgroundColor: "rgba(255,255,255,0.86)", color: "var(--color-navy)", fontWeight: 600 }}
        >
          <Link href="/">
            <ArrowLeft size={15} />
            Back to home
          </Link>
        </Button>

        <Card>
          <CardContent style={{ padding: "36px 32px 32px" }}>

            {/* Branding inside the card */}
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <Link href="/" style={{ display: "inline-block", fontSize: "14px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-navy)", marginBottom: "10px", textDecoration: "none" }}>
                Insight Academy
              </Link>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-navy)", margin: 0 }}>
                Welcome back
              </h1>
              <p style={{ fontSize: "13px", color: "var(--color-muted)", marginTop: "6px" }}>
                Sign in to your account
              </p>
            </div>

            {/* Form */}
            <form style={{ display: "flex", flexDirection: "column", gap: "16px" }} onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="email" style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-muted)" }}>Email</label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  style={{ borderRadius: "8px" }}
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="password" style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-muted)" }}>Password</label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ borderRadius: "8px" }}
                  required
                />
              </div>

              {error ? <p className="text-sm text-error">{error}</p> : null}

              <Button
                type="submit"
                disabled={loading}
                style={{ marginTop: "8px", borderRadius: "8px" }}
              >
                {loading ? "Signing in..." : "Log in"}
              </Button>

              <a
                href="/forgot-password"
                style={{ textAlign: "center", textDecoration: "none", fontSize: "13px", color: "var(--color-muted)" }}
              >
                Forgot your password?
              </a>
            </form>

            {/* New user section */}
            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "12px" }}>
              <p style={{ textAlign: "center", fontSize: "13px", color: "var(--color-muted)", margin: 0 }}>
                New users need an invite email before setting a password.
              </p>
              <JoinInterestModal
                buttonLabel="Request an invite"
                buttonVariant="outline"
                buttonStyle={{ width: "100%", borderRadius: "8px", borderColor: "var(--color-navy)", color: "var(--color-navy)", fontWeight: 600 }}
              />
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
