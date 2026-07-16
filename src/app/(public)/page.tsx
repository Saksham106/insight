import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CheckCircle,
  Clock,
  GraduationCap,
  MessageCircle,
  UserRound,
} from "lucide-react";

import { JoinInterestModal } from "@/components/landing/join-interest-modal";
import { LandingContactModal } from "@/components/landing/landing-contact-modal";
import { Button } from "@/components/ui/button";

const workflowFeatures = [
  {
    icon: CalendarCheck,
    title: "Lesson scheduling",
    description: "Request, propose, confirm, reschedule, or cancel sessions from one calendar.",
  },
  {
    icon: CheckCircle,
    title: "Session requests",
    description: "See what is waiting, review notes, and accept or decline quickly.",
  },
  {
    icon: MessageCircle,
    title: "Private chat and files",
    description: "Keep questions, updates, worksheets, PDFs, and photos with the right pairing.",
  },
  {
    icon: Bell,
    title: "Helpful reminders",
    description: "Email updates and timezone-aware scheduling keep lessons on track.",
  },
];

const roleHighlights = [
  {
    icon: GraduationCap,
    title: "For students and parents",
    items: ["See assigned teachers", "Request sessions", "Review proposals and history"],
  },
  {
    icon: UserRound,
    title: "For teachers",
    items: ["Track assigned students", "Schedule or respond to requests", "Keep chats and files organized"],
  },
];

const trustPoints = [
  { icon: MessageCircle, label: "Teacher-student chat" },
  { icon: CalendarCheck, label: "Session requests" },
  { icon: Clock, label: "Timezone-aware scheduling" },
];

export default function LandingPage() {
  return (
    <div className="bg-background" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
          <Link href="/" className="text-base font-semibold text-navy" style={{ textDecoration: "none" }}>
            Insight Academy
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </nav>

      <main style={{ flex: 1 }}>
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "92px 24px 76px",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "1600px",
              height: "560px",
              borderRadius: "50%",
              background: "radial-gradient(ellipse, rgba(18,48,74,0.16) 0%, transparent 68%)",
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "linear-gradient(rgba(18,48,74,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(18,48,74,0.12) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 62% 78% at 50% 48%, black 35%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 62% 78% at 50% 48%, black 35%, transparent 75%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto", position: "relative", zIndex: 1 }}>
            <div
              style={{
                maxWidth: "700px",
                marginLeft: "auto",
                marginRight: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <p className="text-sm font-semibold uppercase text-slate" style={{ letterSpacing: "0.14em" }}>
                Insight Academy
              </p>
              <h1
                className="text-navy"
                style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.12, margin: 0 }}
              >
                Tutoring tools that keep teachers and students connected
              </h1>
              <p className="text-muted" style={{ fontSize: "18px", lineHeight: 1.7, maxWidth: "580px", margin: 0 }}>
                One workspace for session requests, scheduling, private chat, files, and reminders.
              </p>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                <JoinInterestModal />
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Log in to your account</Link>
                </Button>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center", marginTop: "4px" }}>
                {trustPoints.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      borderRadius: "9999px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "rgba(255,255,255,0.78)",
                      fontSize: "13px",
                      color: "var(--color-slate)",
                      fontWeight: 500,
                    }}
                  >
                    <Icon size={13} strokeWidth={2.2} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            padding: "72px 24px",
            backgroundColor: "var(--color-surface)",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", gap: "40px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "620px" }}>
              <h2 className="text-2xl font-semibold text-navy">What teachers and students can do</h2>
              <p className="text-muted" style={{ fontSize: "16px", lineHeight: 1.65 }}>
                Plan lessons, respond to requests, and keep communication in one place.
              </p>
            </div>

            <div className="form-grid-2" style={{ gap: "18px" }}>
              {workflowFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    style={{
                      display: "flex",
                      gap: "16px",
                      padding: "24px",
                      borderRadius: "8px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-background)",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(18,48,74,0.08)",
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

        <section style={{ padding: "72px 24px" }}>
          <div style={{ maxWidth: "72rem", marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", gap: "40px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "620px" }}>
              <h2 className="text-2xl font-semibold text-navy">Focused on both sides of the lesson</h2>
              <p className="text-muted" style={{ fontSize: "16px", lineHeight: 1.65 }}>
                Simple views for the people using the platform every week.
              </p>
            </div>

            <div className="form-grid-2" style={{ gap: "18px" }}>
              {roleHighlights.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                      padding: "24px",
                      borderRadius: "8px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(18,48,74,0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={18} color="var(--color-navy)" />
                      </div>
                      <h3 className="text-base font-semibold text-navy">{role.title}</h3>
                    </div>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, padding: 0, listStyle: "none" }}>
                      {role.items.map((item) => (
                        <li key={item} className="text-sm text-muted" style={{ display: "flex", alignItems: "flex-start", gap: "8px", lineHeight: 1.5 }}>
                          <CheckCircle size={15} color="var(--color-success)" style={{ marginTop: "2px", flexShrink: 0 }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        <section
          style={{
            padding: "64px 24px",
            backgroundColor: "var(--color-soft)",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              maxWidth: "72rem",
              marginLeft: "auto",
              marginRight: "auto",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.6fr)",
              gap: "28px",
              alignItems: "center",
            }}
            className="landing-contact-grid"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <h2 className="text-2xl font-semibold text-navy">Questions, feedback, or something else?</h2>
              <p className="text-muted" style={{ fontSize: "16px", lineHeight: 1.65, maxWidth: "620px" }}>
                Reach out for support, partnerships, program questions, or product feedback.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <LandingContactModal
                buttonLabel="Contact us"
                buttonStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-navy)", color: "var(--color-navy)" }}
              />
            </div>
          </div>
        </section>

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
              Ready to use Insight Academy?
            </h2>
            <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.76)", margin: 0, maxWidth: "520px", lineHeight: 1.65 }}>
              Log in, or ask to join as a student, parent, or teacher.
            </p>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
              <JoinInterestModal
                buttonStyle={{ backgroundColor: "white", color: "var(--color-navy)" }}
              />
              <Button
                asChild
                size="lg"
                variant="outline"
                style={{ backgroundColor: "transparent", color: "white", borderColor: "rgba(255,255,255,0.38)" }}
              >
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

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
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span className="text-sm font-medium text-navy">Insight Academy</span>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
            <span className="text-sm text-muted">Private tutoring management</span>
            <nav aria-label="Legal links" style={{ display: "flex", gap: "14px" }}>
              <Link href="/privacy" className="text-sm text-slate" style={{ textDecoration: "none" }}>
                Privacy
              </Link>
              <Link href="/terms" className="text-sm text-slate" style={{ textDecoration: "none" }}>
                Terms
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
