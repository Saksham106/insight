"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle, Plus, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChatDrawer } from "@/components/chat/chat-drawer";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { ScheduleSessionForm } from "@/components/sessions/schedule-session-form";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { useMediaQuery } from "@/lib/use-media-query";

interface AssignmentRow {
  id: string;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

interface TeacherDashboardProps {
  assignments: AssignmentRow[];
  teacherId: string;
  view?: TeacherDashboardView;
}

type TeacherDashboardView = "overview" | "schedule" | "requests" | "students";

const viewCopy: Record<TeacherDashboardView, { title: string; description: string }> = {
  overview: {
    title: "Teacher overview",
    description: "A quick look at your schedule, requests, and assigned students.",
  },
  schedule: {
    title: "Schedule",
    description: "Review upcoming sessions and double-click a date to propose a new one.",
  },
  requests: {
    title: "Session requests",
    description: "Confirm or decline times proposed by your students.",
  },
  students: {
    title: "Students",
    description: "Open chats, schedule sessions, and review session history by student.",
  },
};

function WorkflowLinks({
  pendingCount,
  studentCount,
}: {
  pendingCount: number;
  studentCount: number;
}) {
  const links = [
    {
      href: "/teacher/schedule",
      icon: CalendarDays,
      title: "Schedule",
      description: "Calendar view and quick session scheduling.",
    },
    {
      href: "/teacher/requests",
      icon: CheckCircle,
      title: "Requests",
      description: `${pendingCount} student request${pendingCount === 1 ? "" : "s"} waiting.`,
    },
    {
      href: "/teacher/students",
      icon: UserRound,
      title: "Students",
      description: `${studentCount} assigned student${studentCount === 1 ? "" : "s"}.`,
    },
  ];

  return (
    <section className="form-grid-3" style={{ gap: "16px" }}>
      {links.map(({ href, icon: Icon, title, description }) => (
        <Link
          key={href}
          href={href}
          className="border border-border bg-surface"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "20px",
            borderRadius: "12px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              backgroundColor: "rgba(27,53,96,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={18} color="var(--color-navy)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <p className="text-sm font-semibold text-navy">{title}</p>
            <p className="text-sm text-muted" style={{ lineHeight: 1.55 }}>{description}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}

function QuickScheduleModal({
  date,
  assignments,
  onClose,
  proposedBy,
}: {
  date: Date;
  assignments: AssignmentRow[];
  onClose: () => void;
  proposedBy: string;
}) {
  const router = useRouter();
  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const scheduledAt = new Date(`${dateStr}T${time}:00`);
    if (scheduledAt <= new Date()) {
      setError("Please choose a time in the future.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(duration),
        notes: notes.trim() || null,
        proposed_by: proposedBy,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 40, backgroundColor: "rgba(0,0,0,0.35)" }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "100%",
          maxWidth: "440px",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          padding: "24px",
        }}
        className="shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h3 className="text-base font-semibold text-navy">Schedule session</h3>
            <p className="text-sm text-muted" style={{ marginTop: "2px" }}>{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px" }}
            className="text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} onSubmit={handleSubmit}>
          {/* Student */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Student</Label>
            <select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ width: "100%", height: "40px" }}
              required
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.student?.full_name ?? "Student"}
                </option>
              ))}
            </select>
          </div>

          {/* Time + Duration */}
          <div className="form-grid-2">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Time</Label>
              <TimePicker value={time} onChange={setTime} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Duration</Label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                style={{ width: "100%", height: "40px" }}
              >
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Topic, chapter, what to bring..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Proposing..." : "Propose session"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export function TeacherDashboard({ assignments, teacherId, view = "overview" }: TeacherDashboardProps) {
  const [selectedId, setSelectedId] = useState<string>(assignments[0]?.id ?? "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isNarrow = useMediaQuery("(max-width: 480px)");

  const now = new Date();
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const calendarSessions = assignments.flatMap((a) =>
    a.sessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({ ...s, studentName: a.student?.full_name ?? undefined })),
  );

  const thisWeek = calendarSessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return d >= now && d <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // Sessions proposed by students awaiting teacher confirmation
  const pendingRequests = assignments.flatMap((a) =>
    a.sessions
      .filter((s) => s.status === "proposed" && s.proposed_by !== null && s.proposed_by !== teacherId)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .map((s) => ({ ...s, studentName: a.student?.full_name ?? "Student" })),
  );

  const upcoming = (selected?.sessions ?? [])
    .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const past = (selected?.sessions ?? [])
    .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) < now)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 3);

  const conversationId = selected?.conversation?.[0]?.id;
  const copy = viewCopy[view];

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-navy">{copy.title}</h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          {copy.description}
        </p>
      </div>

      {view === "overview" && (
        <WorkflowLinks pendingCount={pendingRequests.length} studentCount={assignments.length} />
      )}

      {/* This week — always on overview, mobile-only on schedule */}
      {((view === "overview") || (view === "schedule" && isMobile)) && thisWeek.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h2 className="text-lg font-semibold text-navy">This week</h2>
          {thisWeek.map((s) => {
            const start = new Date(s.scheduled_at);
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrowStart = new Date(todayStart.getTime() + 86400000);
            const sessionDayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const dayLbl =
              sessionDayStart.getTime() === todayStart.getTime() ? "Today" :
              sessionDayStart.getTime() === tomorrowStart.getTime() ? "Tomorrow" :
              start.toLocaleDateString("en-US", { weekday: "short" });
            const timeStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            const dur = s.duration_minutes >= 120 && s.duration_minutes % 60 === 0
              ? `${s.duration_minutes / 60}h` : `${s.duration_minutes}m`;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700, minWidth: isNarrow ? "32px" : "48px", color: dayLbl === "Today" ? "var(--color-navy)" : "var(--color-foreground)" }}>
                  {dayLbl}
                </span>
                <span className="text-sm text-muted" style={{ whiteSpace: "nowrap" }} suppressHydrationWarning>{timeStr}</span>
                <span className="text-sm text-muted" style={{ whiteSpace: "nowrap" }}>· {dur}</span>
                {s.studentName && (
                  <span className="text-sm font-medium text-foreground" style={{ marginLeft: "auto" }}>{s.studentName}</span>
                )}
                <span style={{
                  display: "inline-flex", borderRadius: "9999px", padding: "2px 10px",
                  fontSize: "11px", fontWeight: 600, border: "1px solid",
                  ...(s.status === "confirmed"
                    ? { backgroundColor: "#eaf2f8", color: "#12304a", borderColor: "#b3cfe0" }
                    : { backgroundColor: "#f6e8c8", color: "#b7791f", borderColor: "#e2c47a" }),
                }}>
                  {s.status === "confirmed" ? "Confirmed" : "Pending"}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Calendar — desktop and mobile (MonthCalendar handles its own responsive view) */}
      {view === "schedule" && (
        <section>
          {!isMobile && <h2 className="text-lg font-semibold text-navy" style={{ marginBottom: "12px" }}>Schedule</h2>}
          <MonthCalendar sessions={calendarSessions} onDateDoubleClick={setScheduleDate} currentUserId={teacherId} role="teacher" hint="Double-click a date to schedule a session" />
        </section>
      )}

      {/* Pending session requests from students */}
      {(view === "requests" || (view === "overview" && pendingRequests.length > 0)) && (
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">Session requests from students</h2>
          {pendingRequests.length === 0 ? (
            <EmptyState icon={CheckCircle} title="No pending requests" description="Student requests will appear here when they propose session times." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {pendingRequests.map((s) => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <p className="text-xs font-medium text-muted">{s.studentName}</p>
                  <SessionCard session={s} currentUserId={teacherId} role="teacher" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Student selector + detail panel */}
      {view === "students" && <section>
        <h2 className="text-lg font-semibold text-navy" style={{ marginBottom: "10px" }}>
          Students
        </h2>

        {assignments.length === 0 ? (
          <EmptyState icon={Users} title="No students assigned yet" description="Your coordinator will pair you with students soon." />
        ) : (
          <>
            {/* Chip row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {assignments.map((a) => {
                const upcomingCount = a.sessions.filter(
                  (s) => s.status !== "cancelled" && new Date(s.scheduled_at) >= now,
                ).length;
                const isSelected = a.id === selectedId;

                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedId(a.id);
                      setShowSchedule(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "9999px",
                      border: `1px solid ${isSelected ? "var(--color-navy)" : "var(--color-border)"}`,
                      backgroundColor: isSelected ? "var(--color-navy)" : "var(--color-surface)",
                      color: isSelected ? "#ffffff" : "var(--color-foreground)",
                      padding: "8px 16px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background-color 0.15s, color 0.15s",
                    }}
                  >
                    {a.student?.full_name ?? "Student"}
                    {upcomingCount > 0 && (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "20px",
                          height: "20px",
                          borderRadius: "9999px",
                          padding: "0 4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : "var(--color-soft)",
                          color: isSelected ? "#ffffff" : "var(--color-navy)",
                        }}
                      >
                        {upcomingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected student panel */}
            {selected && (
              <div
                className="border border-border bg-surface"
                style={{ marginTop: "14px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px", borderRadius: "16px" }}
              >
                {/* Panel header */}
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? "10px" : undefined }}>
                  <h3 className="text-base font-semibold text-navy">
                    {selected.student?.full_name ?? "Student"}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Button
                      size="sm"
                      variant={showSchedule ? "default" : "outline"}
                      onClick={() => setShowSchedule((v) => !v)}
                      style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      {!showSchedule && <Plus style={{ height: "14px", width: "14px" }} />}
                      {showSchedule ? "Close form" : "Schedule session"}
                    </Button>
                    {conversationId && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setChatConversationId(conversationId);
                          setChatTitle(`Chat with ${selected?.student?.full_name ?? "Student"}`);
                        }}
                      >
                        Open chat
                      </Button>
                    )}
                  </div>
                </div>

                {/* Schedule form — toggled */}
                {showSchedule && (
                  <ScheduleSessionForm
                    assignmentId={selected.id}
                    studentName={selected.student?.full_name ?? "student"}
                    proposedBy={teacherId}
                    onSuccess={() => setShowSchedule(false)}
                  />
                )}

                {/* Upcoming sessions */}
                {upcoming.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Upcoming sessions
                    </p>
                    {upcoming.map((s) => (
                      <SessionCard key={s.id} session={s} currentUserId={teacherId} role="teacher" />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={CalendarDays} title="No upcoming sessions" description="Use the form below to schedule your first session." />
                )}

                {/* Past sessions */}
                {past.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Recent past sessions
                    </p>
                    {past.map((s) => (
                      <SessionCard key={s.id} session={s} currentUserId={teacherId} role="teacher" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>}

      {/* Quick-schedule modal — triggered by double-clicking a calendar date */}
      {scheduleDate && (
        <QuickScheduleModal
          date={scheduleDate}
          assignments={assignments}
          onClose={() => setScheduleDate(null)}
          proposedBy={teacherId}
        />
      )}
    </div>
      {chatConversationId && (
        <ChatDrawer
          conversationId={chatConversationId}
          currentUserId={teacherId}
          title={chatTitle}
          onClose={() => setChatConversationId(null)}
        />
      )}
    </>
  );
}
