import Link from "next/link";
import { CalendarCheck, MessageCircle, Shield, Users, Bell, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

const features = [
  {
    icon: MessageCircle,
    title: "Private messaging",
    description: "Chat with your teacher or student in real time, directly inside the platform.",
  },
  {
    icon: CalendarCheck,
    title: "Easy session scheduling",
    description: "Propose, confirm, and reschedule sessions with a shared calendar. No more back-and-forth over text or email.",
  },
  {
    icon: Bell,
    title: "Email notifications",
    description: "Get notified the moment a session is scheduled, confirmed, rescheduled, or cancelled — straight to your inbox.",
  },
  {
    icon: FileText,
    title: "File sharing",
    description: "Send photos, notes, worksheets, and PDFs directly in chat. Share exactly what you need, when you need it.",
  },
  {
    icon: Shield,
    title: "Safe and private",
    description: "Every conversation is kept inside the platform, keeping all interactions professional and secure.",
  },
  {
    icon: Users,
    title: "Coordinator managed",
    description: "Your tutoring coordinator handles all setup and pairings — you just log in and focus on learning.",
  },
];

const steps = [
  {
    number: "1",
    title: "Your coordinator sets you up",
    description: "You'll receive an invite link from your tutoring coordinator. Click it, create your account, and you're in.",
  },
  {
    number: "2",
    title: "Connect with your teacher or student",
    description: "Log in to find who you've been paired with. A private conversation is ready and waiting — no setup needed.",
  },
  {
    number: "3",
    title: "Schedule sessions and communicate",
    description: "Propose sessions, confirm times, share files, and message — all in one place.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <nav
        className="bg-surface"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          borderBottom: "1px solid var(--color-border)",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            marginLeft: "auto",
            marginRight: "auto",
            height: "60px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="text-base font-semibold text-navy">Insight Tutors</span>
          <Button asChild size="sm">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </nav>

      <main style={{ flex: 1 }}>

        {/* Hero */}
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "96px 24px 80px",
          }}
        >
          {/* Subtle background gradient blob */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-80px",
              right: "-120px",
              width: "600px",
              height: "600px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(27,53,96,0.07) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto" }}>
          <div
            style={{
              maxWidth: "680px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
              Insight Tutors
            </p>
            <h1
              className="text-navy"
              style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.15, margin: 0 }}
            >
              Your tutor and student connection, all in one place
            </h1>
            <p className="text-muted" style={{ fontSize: "18px", lineHeight: 1.7, maxWidth: "540px", margin: 0 }}>
              Schedule sessions, chat privately, and share files with your teacher or student — all in one place.
            </p>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Button asChild size="lg">
                <Link href="/login">Log in to your account</Link>
              </Button>
            </div>
          </div>
          </div>
        </section>

        {/* Features */}
        <section
          style={{
            padding: "72px 24px",
            backgroundColor: "var(--color-surface)",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", gap: "48px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2 className="text-2xl font-semibold text-navy">Everything you need to learn and teach</h2>
              <p className="text-muted" style={{ fontSize: "16px" }}>Designed for students, teachers, and the coordinators who support them.</p>
            </div>
            <div className="form-grid-3" style={{ gap: "24px" }}>
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      padding: "24px",
                      borderRadius: "12px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-background)",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(27,53,96,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={20} color="var(--color-navy)" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h3 className="text-sm font-semibold text-navy">{feature.title}</h3>
                      <p className="text-sm text-muted" style={{ lineHeight: 1.65 }}>{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: "72px 24px" }}>
          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", gap: "48px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2 className="text-2xl font-semibold text-navy">How it works</h2>
              <p className="text-muted" style={{ fontSize: "16px" }}>Up and running in three steps.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
              {steps.map((step, i) => (
                <div
                  key={step.number}
                  style={{
                    display: "flex",
                    gap: "24px",
                    paddingBottom: i < steps.length - 1 ? "36px" : "0",
                    position: "relative",
                  }}
                >
                  {/* Line connector */}
                  {i < steps.length - 1 && (
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: "19px",
                        top: "40px",
                        bottom: "0",
                        width: "1px",
                        backgroundColor: "var(--color-border)",
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-navy)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "15px",
                      flexShrink: 0,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {step.number}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingTop: "8px" }}>
                    <h3 className="text-base font-semibold text-navy">{step.title}</h3>
                    <p className="text-sm text-muted" style={{ lineHeight: 1.65 }}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA strip */}
        <section
          style={{
            padding: "64px 24px",
            backgroundColor: "var(--color-navy)",
          }}
        >
          <div
            style={{
              maxWidth: "72rem",
              marginLeft: "auto",
              marginRight: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: 0 }}>
              Ready to get started?
            </h2>
            <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: "440px" }}>
              Already have an account? Log in below. New here? Your coordinator will send you an invite link.
            </p>
            <Button
              asChild
              size="lg"
              style={{ backgroundColor: "white", color: "var(--color-navy)" }}
            >
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className="bg-surface"
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            marginLeft: "auto",
            marginRight: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="text-sm font-medium text-navy">Insight Tutors</span>
          <span className="text-sm text-muted">Private tutoring management</span>
        </div>
      </footer>
    </div>
  );
}
