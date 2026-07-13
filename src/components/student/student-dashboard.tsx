"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle, Plus, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SlotPicker } from "@/components/booking/slot-picker";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { RequestSessionForm } from "@/components/sessions/request-session-form";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { WeekCalendar } from "@/components/sessions/week-calendar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUnreadCounts } from "@/lib/use-unread-counts";

interface AssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

interface StudentDashboardProps {
  assignments: AssignmentRow[];
  studentId: string;
  view?: StudentDashboardView;
}

type StudentDashboardView = "overview" | "schedule" | "requests" | "teachers" | "chats";

const viewCopy: Record<StudentDashboardView, { title: string; description: string }> = {
  overview: {
    title: "Student overview",
    description: "A quick look at your upcoming sessions, proposals, and teachers.",
  },
  schedule: {
    title: "Schedule",
    description: "",
  },
  requests: {
    title: "Session proposals",
    description: "Confirm or decline times proposed by your teachers.",
  },
  teachers: {
    title: "Teachers",
    description: "Open chats, request sessions, and review session history by teacher.",
  },
  chats: {
    title: "Chats",
    description: "Your conversations with teachers.",
  },
};

function WorkflowLinks({
  pendingCount,
  teacherCount,
}: {
  pendingCount: number;
  teacherCount: number;
}) {
  const links = [
    {
      href: "/student/schedule",
      icon: CalendarDays,
      title: "Schedule",
      description: "Calendar view and session requests.",
    },
    {
      href: "/student/requests",
      icon: CheckCircle,
      title: "Proposals",
      description: `${pendingCount} teacher proposal${pendingCount === 1 ? "" : "s"} waiting.`,
    },
    {
      href: "/student/teachers",
      icon: UserRound,
      title: "Teachers",
      description: `${teacherCount} assigned teacher${teacherCount === 1 ? "" : "s"}.`,
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

function toDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateInputLabel(value: string) {
  if (!value) return "Choose a date";

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function QuickRequestModal({
  date,
  assignments,
  studentId,
  onClose,
}: {
  date: Date;
  assignments: AssignmentRow[];
  studentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [dateValue, setDateValue] = useState(toDateInputValue(date));
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const scheduledAt = new Date(`${dateValue}T${time}:00`);
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
        proposed_by: studentId,
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h3 className="text-base font-semibold text-navy">Request session</h3>
            <p className="text-sm text-muted" style={{ marginTop: "2px" }}>{formatDateInputLabel(dateValue)}</p>
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
          {assignments.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Teacher</Label>
              <select
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                style={{ width: "100%", height: "40px" }}
                required
              >
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.teacher?.full_name ?? "Teacher"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Date</Label>
            <input
              type="date"
              value={dateValue}
              min={toDateInputValue(new Date())}
              onChange={(e) => setDateValue(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ width: "100%", height: "40px" }}
              required
            />
          </div>

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

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Topic, chapter, questions you have..."
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
              {loading ? "Sending..." : "Request session"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export function StudentDashboard({ assignments, studentId, view = "overview" }: StudentDashboardProps) {
  const [selectedId, setSelectedId] = useState<string>(assignments[0]?.id ?? "");
  const [showRequest, setShowRequest] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [requestDate, setRequestDate] = useState<Date | null>(null);
  const [chatInitialId, setChatInitialId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isNarrow = useMediaQuery("(max-width: 480px)");

  const now = new Date();
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const calendarSessions = assignments.flatMap((a) =>
    a.sessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({ ...s, teacherName: a.teacher?.full_name ?? undefined })),
  );

  const thisWeek = calendarSessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return d >= now && d <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // Sessions proposed by teachers awaiting student confirmation
  const pendingFromTeachers = assignments.flatMap((a) =>
    a.sessions
      .filter((s) => s.status === "proposed" && s.proposed_by !== null && s.proposed_by !== studentId)
      .sort((x, y) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime())
      .map((s) => ({ ...s, teacherName: a.teacher?.full_name ?? "Teacher" })),
  );
  const futureCalendarCount = calendarSessions.filter((s) => new Date(s.scheduled_at) >= now).length;
  const pendingCalendarCount = calendarSessions.filter((s) => s.status === "proposed").length;

  const upcoming = (selected?.sessions ?? [])
    .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const past = (selected?.sessions ?? [])
    .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) < now)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 3);

  const conversationId = selected?.conversation?.[0]?.id;
  const chatContacts = useMemo(() => assignments
    .filter((a) => a.conversation?.[0]?.id)
    .map((a) => ({ conversationId: a.conversation![0].id, name: a.teacher?.full_name ?? "Teacher" })), [assignments]);
  const { unread: chatUnread, total: totalUnread } = useUnreadCounts(chatContacts);
  const copy = viewCopy[view];

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-semibold text-navy">{copy.title}</h1>
          {copy.description && (
            <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
              {copy.description}
            </p>
          )}
        </div>

        {view === "overview" && (
          <WorkflowLinks pendingCount={pendingFromTeachers.length} teacherCount={assignments.length} />
        )}

        {/* Overview unread messages card */}
        {view === "overview" && totalUnread > 0 && (
          <section
            className="border border-border bg-surface"
            style={{ borderRadius: "12px", padding: "20px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: "14px" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <p className="text-sm font-semibold text-navy">
                {totalUnread} unread message{totalUnread !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted">You have new messages from your teacher{chatContacts.length !== 1 ? "s" : ""}.</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const firstUnread = chatContacts.find((c) => (chatUnread[c.conversationId] ?? 0) > 0);
                if (firstUnread) setChatInitialId(firstUnread.conversationId);
              }}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}
            >
              Open chat
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 3px", fontSize: "10px", fontWeight: 700, backgroundColor: "#ef4444", color: "white" }}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            </Button>
          </section>
        )}

        {/* This week — always on overview, mobile-only on schedule */}
        {((view === "overview") || (view === "schedule" && isMobile)) && thisWeek.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h2 className="text-lg font-semibold text-navy">This week</h2>
            {thisWeek.map((s) => {
              const start = new Date(s.scheduled_at);
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const sessionDayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
              const dayLbl =
                sessionDayStart.getTime() === todayStart.getTime() ? "Today" :
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
                  {s.teacherName && (
                    <span className="text-sm font-medium text-foreground" style={{ marginLeft: "auto" }}>{s.teacherName}</span>
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

        {/* Pending proposals from teachers — on schedule tab (if any) and overview (if any) and standalone requests view */}
        {(view === "requests" || (view === "overview" && pendingFromTeachers.length > 0) || (view === "schedule" && pendingFromTeachers.length > 0)) && (
          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Proposals from teachers</h2>
            {pendingFromTeachers.length === 0 ? (
              <EmptyState icon={CheckCircle} title="No pending proposals" description="Teacher proposals will appear here when they suggest session times." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {pendingFromTeachers.map((s) => (
                  <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <p className="text-xs font-medium text-muted">{s.teacherName}</p>
                    <SessionCard session={s} currentUserId={studentId} role="student" />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Find a time — book directly from teacher availability */}
        {view === "schedule" && (
          <SlotPicker
            assignments={assignments.map((a) => ({ id: a.id, teacher: a.teacher }))}
          />
        )}

        {/* Calendar — desktop and mobile */}
        {view === "schedule" && (
          <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              className="border border-border bg-surface"
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                justifyContent: "space-between",
                gap: "14px",
                borderRadius: "12px",
                padding: isMobile ? "14px" : "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(27,53,96,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CalendarDays size={18} color="var(--color-navy)" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                  <p className="text-sm font-semibold text-navy">Calendar</p>
                  <p className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
                    {assignments.length} assigned teacher{assignments.length === 1 ? "" : "s"} · {futureCalendarCount} upcoming · {pendingCalendarCount} pending
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: isMobile ? "wrap" : undefined }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <Button size="sm" variant={calendarMode === "month" ? "default" : "outline"} onClick={() => setCalendarMode("month")}>Month</Button>
                  <Button size="sm" variant={calendarMode === "week" ? "default" : "outline"} onClick={() => setCalendarMode("week")}>Week</Button>
                </div>
                <Button
                  onClick={() => setRequestDate(new Date())}
                  disabled={assignments.length === 0}
                  style={{ display: "flex", alignItems: "center", gap: "6px", width: isMobile ? "100%" : undefined }}
                >
                  <Plus style={{ height: "16px", width: "16px" }} />
                  Request session
                </Button>
              </div>
            </div>
            {calendarMode === "month" ? (
              <MonthCalendar
                sessions={calendarSessions}
                onDateDoubleClick={setRequestDate}
                currentUserId={studentId}
                role="student"
                hint={isMobile ? undefined : "Double-click a date to request a session"}
              />
            ) : (
              <WeekCalendar
                sessions={calendarSessions}
                onSlotSelect={(start) => setRequestDate(start)}
              />
            )}
          </section>
        )}

        {/* Teacher chip selector + detail panel */}
        {view === "teachers" && <section>
          <h2 className="text-lg font-semibold text-navy" style={{ marginBottom: "10px" }}>
            Teachers
          </h2>

          {assignments.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No teachers assigned yet"
              description="Your coordinator will assign a teacher to you soon."
            />
          ) : (
            <>
              {/* Chip row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {assignments.map((a) => {
                  const upcomingCount = a.sessions.filter(
                    (s) => s.status !== "cancelled" && new Date(s.scheduled_at) >= now,
                  ).length;
                  const isSelected = a.id === selectedId;
                  const convId = a.conversation?.[0]?.id;
                  const chipUnread = convId ? (chatUnread[convId] ?? 0) : 0;

                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelectedId(a.id);
                        setShowRequest(false);
                        setShowBooking(false);
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
                      {a.teacher?.full_name ?? "Teacher"}
                      {upcomingCount > 0 && (
                        <span
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            minWidth: "20px", height: "20px", borderRadius: "9999px",
                            padding: "0 4px", fontSize: "11px", fontWeight: 700,
                            backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : "var(--color-soft)",
                            color: isSelected ? "#ffffff" : "var(--color-navy)",
                          }}
                        >
                          {upcomingCount}
                        </span>
                      )}
                      {chipUnread > 0 && (
                        <span
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            minWidth: "20px", height: "20px", borderRadius: "9999px",
                            padding: "0 4px", fontSize: "11px", fontWeight: 700,
                            backgroundColor: "#ef4444", color: "white",
                          }}
                        >
                          {chipUnread > 99 ? "99+" : chipUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected teacher panel */}
              {selected && (
                <div
                  className="border border-border bg-surface"
                  style={{ marginTop: "14px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px", borderRadius: "16px" }}
                >
                  {/* Panel header */}
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? "10px" : undefined }}>
                    <h3 className="text-base font-semibold text-navy">
                      {selected.teacher?.full_name ?? "Teacher"}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Button
                        size="sm"
                        variant={showBooking ? "default" : "outline"}
                        onClick={() => { setShowBooking((v) => !v); setShowRequest(false); }}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {showBooking ? "Close" : "Book a time"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowRequest((v) => !v); setShowBooking(false); }}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {showRequest ? "Close" : "Request another time"}
                      </Button>
                      {conversationId && (
                        <Button
                          size="sm"
                          onClick={() => setChatInitialId(conversationId)}
                          style={{ display: "flex", alignItems: "center", gap: "6px" }}
                        >
                          Open chat
                          {(chatUnread[conversationId] ?? 0) > 0 && (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 3px", fontSize: "10px", fontWeight: 700, backgroundColor: "#ef4444", color: "white" }}>
                              {(chatUnread[conversationId] ?? 0) > 99 ? "99+" : chatUnread[conversationId]}
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Booking slot picker — toggled */}
                  {showBooking && (
                    <SlotPicker
                      assignments={[{ id: selected.id, teacher: selected.teacher }]}
                      singleAssignmentId={selected.id}
                    />
                  )}

                  {/* Request form — toggled */}
                  {showRequest && (
                    <RequestSessionForm
                      assignmentId={selected.id}
                      studentId={studentId}
                      teacherName={selected.teacher?.full_name ?? "your teacher"}
                      embedded
                      onSuccess={() => setShowRequest(false)}
                    />
                  )}

                  {/* Upcoming sessions */}
                  {upcoming.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Upcoming sessions
                      </p>
                      {upcoming.map((s) => (
                        <SessionCard key={s.id} session={s} currentUserId={studentId} role="student" />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={CalendarDays}
                      title="No upcoming sessions"
                      description="Use the button above to request a session."
                    />
                  )}

                  {/* Past sessions */}
                  {past.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Recent past sessions
                      </p>
                      {past.map((s) => (
                        <SessionCard key={s.id} session={s} currentUserId={studentId} role="student" />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>}

        {/* Chats view */}
        {view === "chats" && (
          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {chatContacts.length === 0 ? (
              <EmptyState icon={Users} title="No conversations yet" description="Once you're paired with a teacher, your chat will appear here." />
            ) : (
              chatContacts.map((contact) => {
                const count = chatUnread[contact.conversationId] ?? 0;
                const initials = contact.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div
                    key={contact.conversationId}
                    className="border border-border bg-surface"
                    style={{ borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--color-navy)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
                          {initials}
                        </div>
                        {count > 0 && (
                          <span style={{ position: "absolute", top: "-3px", right: "-3px", backgroundColor: "#ef4444", color: "white", fontSize: "10px", fontWeight: 700, borderRadius: "999px", minWidth: "17px", height: "17px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy">{contact.name}</p>
                        {count > 0 && <p className="text-xs text-muted" style={{ marginTop: "2px" }}>{count} unread message{count !== 1 ? "s" : ""}</p>}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setChatInitialId(contact.conversationId)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                      Open chat
                      {count > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 3px", fontSize: "10px", fontWeight: 700, backgroundColor: "#ef4444", color: "white" }}>
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* Quick-request modal — triggered by double-clicking a calendar date */}
        {requestDate && (
          <QuickRequestModal
            date={requestDate}
            assignments={assignments}
            studentId={studentId}
            onClose={() => setRequestDate(null)}
          />
        )}
      </div>

      {chatInitialId && chatContacts.length > 0 && (
        <ChatDrawer
          contacts={chatContacts}
          initialConversationId={chatInitialId}
          currentUserId={studentId}
          onClose={() => setChatInitialId(null)}
        />
      )}
    </>
  );
}
