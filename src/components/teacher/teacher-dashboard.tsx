"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { ChatDrawer } from "@/components/chat/chat-drawer";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { ScheduleSessionForm } from "@/components/sessions/schedule-session-form";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AssignmentRow {
  id: string;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

interface TeacherDashboardProps {
  assignments: AssignmentRow[];
  teacherId: string;
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
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        scheduled_at: new Date(`${dateStr}T${time}:00`).toISOString(),
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
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
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

export function TeacherDashboard({ assignments, teacherId }: TeacherDashboardProps) {
  const [selectedId, setSelectedId] = useState<string>(assignments[0]?.id ?? "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("");

  const now = new Date();
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const calendarSessions = assignments.flatMap((a) =>
    a.sessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({ ...s, studentName: a.student?.full_name ?? undefined })),
  );

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

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-navy">Welcome back</h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          Here are your assigned students and sessions.
        </p>
      </div>

      {/* Calendar — double-click any date to schedule */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">Schedule</h2>
          <p className="text-xs text-muted">Double-click a date to schedule a session</p>
        </div>
        <MonthCalendar sessions={calendarSessions} onDateDoubleClick={setScheduleDate} currentUserId={teacherId} role="teacher" />
      </section>

      {/* Pending session requests from students */}
      {pendingRequests.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">Session requests from students</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendingRequests.map((s) => (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <p className="text-xs font-medium text-muted">{s.studentName}</p>
                <SessionCard session={s} currentUserId={teacherId} role="teacher" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Student selector + detail panel */}
      <section>
        <h2 className="text-lg font-semibold text-navy" style={{ marginBottom: "10px" }}>
          Students
        </h2>

        {assignments.length === 0 ? (
          <p className="text-sm text-muted">No students assigned yet.</p>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                {upcoming.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Upcoming sessions
                    </p>
                    {upcoming.map((s) => (
                      <SessionCard key={s.id} session={s} currentUserId={teacherId} role="teacher" />
                    ))}
                  </div>
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
      </section>

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
