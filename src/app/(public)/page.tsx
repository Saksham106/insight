import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle,
  FileText,
  GraduationCap,
  MessageCircle,
  UserRound,
} from "lucide-react";

import { JoinInterestModal } from "@/components/landing/join-interest-modal";
import { LandingContactModal } from "@/components/landing/landing-contact-modal";
import { Button } from "@/components/ui/button";

/* Hallmark · genre: playful · macrostructure: Split Studio · nav: N1a · footer: Ft5 Statement
 * theme: custom (design.md) · enrichment: Tier-A CSS-art proof panels · designed-as-app
 */

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

/* Tier-A CSS-art proof panel: a confirmed session + the chat that set it up. */
function HeroProofPanel() {
  return (
    <div aria-hidden style={{ position: "relative", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        className="hover-lift"
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-rule)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink)" }}>
            Algebra II with Ms. Rivera
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--color-success)",
              backgroundColor: "var(--color-success-soft)",
              borderRadius: "var(--radius-pill)",
              padding: "3px 10px",
            }}
          >
            Confirmed
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-ink-2)", fontSize: "13px" }}>
          <CalendarCheck size={14} strokeWidth={2.2} />
          <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12.5px" }}>Tue · 4:30–5:30 PM · your time</span>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-rule)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginLeft: "28px",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "var(--color-accent-soft)",
              color: "var(--color-accent-deep)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            MR
          </div>
          <div
            style={{
              backgroundColor: "var(--color-paper-2)",
              borderRadius: "12px 12px 12px 4px",
              padding: "10px 14px",
              fontSize: "13px",
              color: "var(--color-ink)",
              lineHeight: 1.5,
            }}
          >
            Worksheet attached — try #4 before Tuesday and we’ll start there.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "38px" }}>
          <FileText size={13} color="var(--color-accent-deep)" />
          <span style={{ fontSize: "12px", color: "var(--color-ink-2)", fontFamily: "var(--font-geist-mono)" }}>
            quadratics-practice.pdf
          </span>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "var(--color-accent-soft)",
          borderRadius: "var(--radius-card)",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "fit-content",
        }}
      >
        <MessageCircle size={14} color="var(--color-accent-deep)" strokeWidth={2.2} />
        <span style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--color-accent-deep)" }}>
          New session request from Priya · awaiting reply
        </span>
      </div>
    </div>
  );
}

/* Tier-A CSS-art: a quiet week strip for the scheduling diptych. */
function ScheduleProofPanel() {
  const days = [
    { day: "Mon", slot: null },
    { day: "Tue", slot: "4:30 PM" },
    { day: "Wed", slot: null },
    { day: "Thu", slot: "5:00 PM" },
    { day: "Fri", slot: null },
  ];
  return (
    <div
      aria-hidden
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-rule)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink)" }}>This week</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
        {days.map(({ day, slot }) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "stretch" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--color-ink-2)",
                textAlign: "center",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {day}
            </span>
            <div
              style={{
                height: "64px",
                borderRadius: "8px",
                backgroundColor: slot ? "var(--color-accent-soft)" : "var(--color-paper-2)",
                border: slot ? "1px solid var(--color-accent)" : "1px dashed var(--color-rule)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
              }}
            >
              {slot ? (
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: "var(--color-accent-deep)",
                    textAlign: "center",
                    lineHeight: 1.3,
                  }}
                >
                  {slot}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.5 }}>
        Requests land here — accept, propose a new time, or decline with a note.
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--color-paper)" }}>
      {/* Nav — N1a: wordmark + the page's one destination */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          backgroundColor: "var(--color-paper)",
          borderBottom: "1px solid var(--color-rule)",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "17px",
              letterSpacing: "-0.02em",
              color: "var(--color-ink)",
            }}
          >
            Insight&nbsp;Academy
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </nav>

      <main style={{ flex: 1 }}>
        {/* Hero — Split Studio diptych: statement left, proof right */}
        <section style={{ padding: "var(--space-2xl) 24px var(--space-2xl)" }}>
          <div className="diptych" style={{ maxWidth: "72rem", margin: "0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", minWidth: 0 }}>
              <h1
                style={{
                  fontSize: "var(--text-display)",
                  fontWeight: 700,
                  lineHeight: 1.08,
                  margin: 0,
                  color: "var(--color-ink)",
                }}
              >
                Tutoring, minus the back‑and‑forth.
              </h1>
              <p
                style={{
                  fontSize: "18px",
                  lineHeight: 1.65,
                  color: "var(--color-ink-2)",
                  margin: 0,
                  maxWidth: "46ch",
                }}
              >
                Insight Academy is one calm workspace for session requests, scheduling,
                private chat, and files — for the teachers, students, and parents in
                your tutoring program.
              </p>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <JoinInterestModal buttonLabel="Request an invite" />
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-muted)" }}>
                Session requests · private chat · timezone-aware scheduling
              </p>
            </div>
            <HeroProofPanel />
          </div>
        </section>

        {/* Diptych 2 — proof left, text right (alternates direction) */}
        <section
          style={{
            padding: "var(--space-2xl) 24px",
            backgroundColor: "var(--color-paper-2)",
            borderTop: "1px solid var(--color-rule-2)",
            borderBottom: "1px solid var(--color-rule-2)",
          }}
        >
          <div className="diptych" style={{ maxWidth: "72rem", margin: "0 auto" }}>
            <ScheduleProofPanel />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", minWidth: 0 }}>
              <h2 style={{ fontSize: "var(--text-display-s)", fontWeight: 650, margin: 0, color: "var(--color-ink)", lineHeight: 1.15 }}>
                Scheduling that settles itself
              </h2>
              <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--color-ink-2)", margin: 0, maxWidth: "52ch" }}>
                Request, propose, confirm, reschedule, or cancel from one calendar.
                Every time shows in each person’s own timezone, and email reminders
                keep lessons on track without anyone chasing.
              </p>
            </div>
          </div>
        </section>

        {/* Diptych 3 — text left, proof right */}
        <section style={{ padding: "var(--space-2xl) 24px" }}>
          <div className="diptych" style={{ maxWidth: "72rem", margin: "0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", minWidth: 0 }}>
              <h2 style={{ fontSize: "var(--text-display-s)", fontWeight: 650, margin: 0, color: "var(--color-ink)", lineHeight: 1.15 }}>
                Every conversation, with its lesson
              </h2>
              <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--color-ink-2)", margin: 0, maxWidth: "52ch" }}>
                Questions, updates, worksheets, PDFs, and photos stay with the right
                teacher–student pairing — not scattered across texts, emails, and
                group chats. Pick up any thread exactly where it left off.
              </p>
            </div>
            <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
              <div
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "var(--color-paper-2)",
                  borderRadius: "12px 12px 12px 4px",
                  padding: "12px 16px",
                  fontSize: "13.5px",
                  color: "var(--color-ink)",
                  lineHeight: 1.55,
                  maxWidth: "85%",
                }}
              >
                Can we move Thursday? Robotics ran over and homework is piling up.
              </div>
              <div
                style={{
                  alignSelf: "flex-end",
                  backgroundColor: "var(--color-accent-soft)",
                  borderRadius: "12px 12px 4px 12px",
                  padding: "12px 16px",
                  fontSize: "13.5px",
                  color: "var(--color-ink)",
                  lineHeight: 1.55,
                  maxWidth: "85%",
                }}
              >
                Sure — I proposed Friday 5:00 in the calendar. Accept it and we’re set.
              </div>
              <div
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-rule)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                }}
              >
                <FileText size={14} color="var(--color-accent-deep)" />
                <span style={{ fontSize: "12.5px", color: "var(--color-ink-2)", fontFamily: "var(--font-geist-mono)" }}>
                  essay-draft-2.pdf
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Roles — two cards on a tinted band */}
        <section
          style={{
            padding: "var(--space-2xl) 24px",
            backgroundColor: "var(--color-paper-2)",
            borderTop: "1px solid var(--color-rule-2)",
            borderBottom: "1px solid var(--color-rule-2)",
          }}
        >
          <div style={{ maxWidth: "72rem", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <h2 style={{ fontSize: "var(--text-display-s)", fontWeight: 650, margin: 0, color: "var(--color-ink)", lineHeight: 1.15, maxWidth: "24ch" }}>
              Made for both sides of the lesson
            </h2>
            <div className="form-grid-2" style={{ gap: "18px" }}>
              {roleHighlights.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    className="hover-lift"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                      padding: "28px",
                      borderRadius: "var(--radius-card)",
                      border: "1px solid var(--color-rule)",
                      backgroundColor: "var(--color-card)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          backgroundColor: "var(--color-accent-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={18} color="var(--color-accent-deep)" />
                      </div>
                      <h3 style={{ fontSize: "17px", fontWeight: 650, margin: 0, color: "var(--color-ink)" }}>{role.title}</h3>
                    </div>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, padding: 0, listStyle: "none" }}>
                      {role.items.map((item) => (
                        <li
                          key={item}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            lineHeight: 1.5,
                            fontSize: "14px",
                            color: "var(--color-ink-2)",
                          }}
                        >
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

        {/* Contact — quiet split */}
        <section style={{ padding: "var(--space-2xl) 24px" }}>
          <div
            className="landing-contact-grid"
            style={{
              maxWidth: "72rem",
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.6fr)",
              gap: "28px",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <h2 style={{ fontSize: "26px", fontWeight: 650, margin: 0, color: "var(--color-ink)" }}>
                Questions, feedback, or something else?
              </h2>
              <p style={{ fontSize: "16px", lineHeight: 1.65, color: "var(--color-ink-2)", margin: 0, maxWidth: "56ch" }}>
                Reach out for support, partnerships, program questions, or product feedback.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <LandingContactModal buttonLabel="Contact us" />
            </div>
          </div>
        </section>

        {/* Final CTA strip — one button */}
        <section
          style={{
            padding: "var(--space-2xl) 24px",
            backgroundColor: "var(--color-accent-soft)",
            borderTop: "1px solid var(--color-rule-2)",
          }}
        >
          <div
            style={{
              maxWidth: "72rem",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: "var(--text-display-s)", fontWeight: 700, margin: 0, color: "var(--color-ink)", lineHeight: 1.15 }}>
              Ready when your program is
            </h2>
            <p style={{ fontSize: "16px", color: "var(--color-ink-2)", margin: 0, maxWidth: "44ch", lineHeight: 1.65 }}>
              Ask to join as a student, parent, or teacher — we’ll send an invite.
            </p>
            <JoinInterestModal buttonLabel="Request an invite" />
          </div>
        </section>
      </main>

      {/* Footer — Ft5 Statement */}
      <footer style={{ backgroundColor: "var(--color-paper)", borderTop: "1px solid var(--color-rule)", padding: "var(--space-xl) 24px var(--space-lg)" }}>
        <div style={{ maxWidth: "72rem", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
              fontWeight: 650,
              letterSpacing: "-0.025em",
              color: "var(--color-ink)",
              margin: 0,
              maxWidth: "22ch",
              lineHeight: 1.2,
            }}
          >
            A calmer way to run tutoring.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              borderTop: "1px solid var(--color-rule-2)",
              paddingTop: "var(--space-sm)",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
              Insight Academy
            </span>
            <nav aria-label="Legal links" style={{ display: "flex", gap: "18px" }}>
              <Link href="/privacy" style={{ textDecoration: "none", fontSize: "13.5px", color: "var(--color-ink-2)" }}>
                Privacy
              </Link>
              <Link href="/terms" style={{ textDecoration: "none", fontSize: "13.5px", color: "var(--color-ink-2)" }}>
                Terms
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
