"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Session } from "./session-card";

type CalendarSession = Session & { studentName?: string; teacherName?: string };

interface MonthCalendarProps {
  sessions: CalendarSession[];
  onDateDoubleClick?: (date: Date) => void;
  currentUserId?: string;
  role?: "teacher" | "student" | "admin";
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const statusDot: Record<Session["status"], string> = {
  confirmed: "#12304a",
  proposed: "#d8a24a",
  cancelled: "#d9e2ec",
};

const statusLabel: Record<Session["status"], string> = {
  confirmed: "Confirmed",
  proposed: "Pending",
  cancelled: "Cancelled",
};

const statusPillStyle: Record<Session["status"], React.CSSProperties> = {
  confirmed: { backgroundColor: "#eaf2f8", color: "#12304a", borderColor: "#b3cfe0" },
  proposed: { backgroundColor: "#f6e8c8", color: "#b7791f", borderColor: "#e2c47a" },
  cancelled: { backgroundColor: "#f1f5f9", color: "#667085", borderColor: "#d9e2ec" },
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};

const BORDER_RIGHT = "1px solid var(--color-border)";
const BORDER_BOTTOM = "1px solid var(--color-border)";

function buildGrid(year: number, month: number): Date[] {
  const utcDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysFromMonday = utcDow === 0 ? 6 : utcDow - 1;
  return Array.from({ length: 42 }, (_, i) =>
    new Date(year, month, 1 - daysFromMonday + i),
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface PopoverState {
  session: CalendarSession;
  top: number;
  left: number;
}

function RescheduleModal({
  session,
  onClose,
  onSuccess,
  proposedBy,
}: {
  session: CalendarSession;
  onClose: () => void;
  onSuccess: () => void;
  proposedBy: string;
}) {
  const start = new Date(session.scheduled_at);
  const initialDate = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
  const initialTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;

  const [newDate, setNewDate] = useState(initialDate);
  const [newTime, setNewTime] = useState(initialTime);
  const [newDuration, setNewDuration] = useState(String(session.duration_minutes));
  const [newNotes, setNewNotes] = useState(session.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled_at: new Date(`${newDate}T${newTime}:00`).toISOString(),
        duration_minutes: parseInt(newDuration),
        notes: newNotes.trim() || null,
        status: "proposed",
        proposed_by: proposedBy,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }
    onSuccess();
  };

  const dateLabel = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

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
            <h3 className="text-base font-semibold text-navy">Reschedule session</h3>
            <p className="text-sm text-muted" style={{ marginTop: "2px" }}>
              {session.studentName ? `with ${session.studentName} · ` : ""}{dateLabel}
            </p>
          </div>
          <button onClick={onClose} style={{ padding: "4px" }} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} onSubmit={handleSubmit}>
          <div className="form-grid-3">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Time</Label>
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label>Duration</Label>
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
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
              placeholder="Topic, chapter, what to bring..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <p className="text-xs text-muted">The student will be asked to re-confirm the new time.</p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Propose new time"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export function MonthCalendar({ sessions, onDateDoubleClick, currentUserId, role }: MonthCalendarProps) {
  const router = useRouter();
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [actionLoading, setActionLoading] = useState<"confirm" | "cancel" | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CalendarSession | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const updateSession = async (sessionId: string, status: "confirmed" | "cancelled") => {
    const action = status === "confirmed" ? "confirm" : "cancel";
    setActionLoading(action);
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(status === "cancelled" && currentUserId ? { cancelled_by: currentUserId } : {}),
      }),
    });
    setActionLoading(null);
    setPopover(null);
    setExpandedSessionId(null);
    router.refresh();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const allDays = buildGrid(year, month);
  const allWeeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) allWeeks.push(allDays.slice(i, i + 7));
  const weeks = allWeeks.filter((w) => w.some((d) => d.getMonth() === month));

  const monthLabel = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Agenda data for mobile view — sessions in the current month grouped by day
  const agendaSessions = sessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return s.status !== "cancelled" && d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const agendaByDayMap = new Map<string, CalendarSession[]>();
  for (const s of agendaSessions) {
    const key = [
      new Date(s.scheduled_at).getFullYear(),
      String(new Date(s.scheduled_at).getMonth() + 1).padStart(2, "0"),
      String(new Date(s.scheduled_at).getDate()).padStart(2, "0"),
    ].join("-");
    if (!agendaByDayMap.has(key)) agendaByDayMap.set(key, []);
    agendaByDayMap.get(key)!.push(s);
  }
  const agendaByDay = Array.from(agendaByDayMap.entries()).map(([date, daySessions]) => ({ date, daySessions }));

  const handleEventClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    session: CalendarSession,
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverW = 300;
    const popoverH = 220;
    let left = rect.right + 10;
    if (left + popoverW > window.innerWidth - 8) left = rect.left - popoverW - 10;
    left = Math.max(8, left);
    let top = rect.top;
    if (top + popoverH > window.innerHeight - 8) top = window.innerHeight - popoverH - 8;
    top = Math.max(8, top);
    setPopover({ session, top, left });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h3 className="text-xl font-bold text-navy">{monthLabel}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(); setViewDate(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile agenda view */}
      {isMobile && <div>
        <div style={{ borderRadius: "12px", border: "1px solid var(--color-border)", overflow: "hidden", backgroundColor: "var(--color-surface)" }}>
          {agendaByDay.length === 0 ? (
            <p className="text-sm text-muted" style={{ padding: "24px 16px", textAlign: "center" }}>
              No sessions scheduled in {monthLabel}.
            </p>
          ) : (
            agendaByDay.map(({ date, daySessions }, gi) => {
              const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              });
              const isPastDay = new Date(date + "T23:59:59") < today;
              return (
                <div key={date} style={{ borderBottom: gi < agendaByDay.length - 1 ? BORDER_BOTTOM : undefined }}>
                  {/* Day header */}
                  <div style={{ padding: "8px 16px", backgroundColor: "var(--color-background)", borderBottom: BORDER_BOTTOM }}>
                    <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", opacity: isPastDay ? 0.6 : 1 }}>
                      {dayLabel}
                    </p>
                  </div>
                  {/* Sessions */}
                  {daySessions.map((s, si) => {
                    const sStart = new Date(s.scheduled_at);
                    const sEnd = new Date(sStart.getTime() + s.duration_minutes * 60_000);
                    const timeStr = sStart.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
                    const endStr = sEnd.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
                    const isExpanded = expandedSessionId === s.id;
                    const iAmProposer = currentUserId
                      ? (s.proposed_by !== null ? s.proposed_by === currentUserId : role === "teacher")
                      : false;
                    const label = s.teacherName
                      ? `${s.teacherName} → ${s.studentName ?? "Student"}`
                      : s.studentName ?? null;
                    return (
                      <div key={s.id} style={{ borderBottom: si < daySessions.length - 1 ? BORDER_BOTTOM : undefined, opacity: isPastDay ? 0.65 : 1 }}>
                        <button
                          onClick={() => setExpandedSessionId(isExpanded ? null : s.id)}
                          style={{ width: "100%", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <span style={{ height: "8px", width: "8px", borderRadius: "50%", flexShrink: 0, backgroundColor: statusDot[s.status] }} />
                            <div style={{ minWidth: 0 }}>
                              <p className="text-sm font-semibold text-navy">{timeStr} – {endStr} · {s.duration_minutes} min</p>
                              {label && <p className="text-xs text-muted" style={{ marginTop: "2px" }}>{label}</p>}
                            </div>
                          </div>
                          <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, borderRadius: "9999px", padding: "2px 10px", fontSize: "11px", fontWeight: 600, border: "1px solid", ...statusPillStyle[s.status] }}>
                            {statusLabel[s.status]}
                          </span>
                        </button>

                        {/* Inline actions when expanded */}
                        {isExpanded && currentUserId && role && (
                          <div style={{ padding: "4px 16px 14px 34px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {s.status === "proposed" && !iAmProposer && (
                              <>
                                <Button size="sm" onClick={() => updateSession(s.id, "confirmed")} disabled={actionLoading !== null}>
                                  {actionLoading === "confirm" ? "Confirming..." : "Confirm"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => updateSession(s.id, "cancelled")} disabled={actionLoading !== null}>
                                  {actionLoading === "cancel" ? "Declining..." : "Decline"}
                                </Button>
                              </>
                            )}
                            {s.status === "proposed" && iAmProposer && (
                              <>
                                {role === "teacher" && (
                                  <Button size="sm" variant="outline" onClick={() => { setRescheduleTarget(s); setExpandedSessionId(null); }}>
                                    Reschedule
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => updateSession(s.id, "cancelled")} disabled={actionLoading !== null}>
                                  {actionLoading === "cancel" ? "Cancelling..." : "Cancel"}
                                </Button>
                              </>
                            )}
                            {s.status === "confirmed" && role !== "admin" && (
                              <>
                                {role === "teacher" && (
                                  <Button size="sm" variant="outline" onClick={() => { setRescheduleTarget(s); setExpandedSessionId(null); }}>
                                    Reschedule
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => updateSession(s.id, "cancelled")} disabled={actionLoading !== null}>
                                  {actionLoading === "cancel" ? "Cancelling..." : "Cancel session"}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>}

      {/* Desktop calendar grid */}
      {!isMobile && <div>
      {/* Calendar grid */}
      <div
        style={{ overflow: "hidden", borderRadius: "12px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}
        onClick={() => setPopover(null)}
      >
        {/* Day-of-week header row */}
        <div style={{ ...GRID, borderBottom: BORDER_BOTTOM, backgroundColor: "var(--color-background)" }}>
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              style={{
                padding: "10px 12px 10px 4px",
                textAlign: "right",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-muted)",
                borderRight: i < 6 ? BORDER_RIGHT : undefined,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              ...GRID,
              borderBottom: wi < weeks.length - 1 ? BORDER_BOTTOM : undefined,
            }}
          >
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === month;
              const isToday = sameDay(day, today);
              const daySessions = sessions
                .filter((s) => sameDay(new Date(s.scheduled_at), day))
                .filter((s) => s.status !== "cancelled")
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
              const visible = daySessions.slice(0, 3);
              const overflow = daySessions.length - visible.length;

              return (
                <div
                  key={di}
                  style={{
                    minHeight: "96px",
                    padding: "6px",
                    borderRight: di < 6 ? BORDER_RIGHT : undefined,
                    backgroundColor: isCurrentMonth ? undefined : "var(--color-background)",
                    cursor: onDateDoubleClick ? "default" : undefined,
                  }}
                  onDoubleClick={() => onDateDoubleClick?.(day)}
                >
                  {/* Date number — right-aligned */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px", paddingRight: "2px", paddingTop: "2px" }}>
                    <span
                      style={{
                        display: "flex",
                        height: "24px",
                        width: "24px",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: isToday ? "var(--color-navy)" : undefined,
                        color: isToday
                          ? "#ffffff"
                          : isCurrentMonth
                            ? "var(--color-foreground)"
                            : "var(--color-muted)",
                        opacity: isCurrentMonth ? 1 : 0.4,
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Event pills */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {visible.map((s) => {
                      const time = new Date(s.scheduled_at).toLocaleTimeString("en-CA", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      return (
                        <button
                          key={s.id}
                          onClick={(e) => handleEventClick(e, s)}
                          onDoubleClick={(e) => e.stopPropagation()}
                          style={{
                            display: "flex",
                            width: "100%",
                            alignItems: "center",
                            gap: "4px",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            textAlign: "left",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                          }}
                          className="hover:bg-soft"
                        >
                          <span
                            style={{
                              height: "6px",
                              width: "6px",
                              borderRadius: "50%",
                              flexShrink: 0,
                              backgroundColor: statusDot[s.status],
                            }}
                          />
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-foreground)", flexShrink: 0 }}>
                            {time}
                          </span>
                          {s.studentName && (
                            <span style={{ fontSize: "11px", color: "var(--color-muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.studentName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <p style={{ padding: "0 4px", fontSize: "10px", color: "var(--color-muted)" }}>
                        +{overflow} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      </div>}

      {/* Reschedule modal */}
      {rescheduleTarget && (
        <RescheduleModal
          session={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => { setRescheduleTarget(null); router.refresh(); }}
          proposedBy={currentUserId ?? ""}
        />
      )}

      {/* Event detail popover */}
      {popover && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setPopover(null)} />
          <div
            style={{ position: "fixed", top: popover.top, left: popover.left, zIndex: 50, width: "300px" }}
            className="rounded-xl border border-border bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ height: "12px", width: "12px", borderRadius: "50%", flexShrink: 0, marginTop: "2px", backgroundColor: statusDot[popover.session.status] }} />
                <p className="font-semibold text-navy">
                  {popover.session.teacherName
                    ? `${popover.session.teacherName} → ${popover.session.studentName ?? "Student"}`
                    : (popover.session.studentName ?? "Session")}
                </p>
              </div>
              <button onClick={() => setPopover(null)} className="text-muted transition-colors hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px" }}>
              <p className="text-foreground">
                {new Date(popover.session.scheduled_at).toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </p>
              <p className="text-muted">
                {new Date(popover.session.scheduled_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                {" – "}
                {new Date(new Date(popover.session.scheduled_at).getTime() + popover.session.duration_minutes * 60_000).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                <span className="ml-2 text-muted">· {popover.session.duration_minutes} min</span>
              </p>
              {popover.session.notes && <p className="text-foreground">{popover.session.notes}</p>}
              <div style={{ paddingTop: "8px" }}>
                <span
                  style={{ display: "inline-flex", alignItems: "center", ...statusPillStyle[popover.session.status] }}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {statusLabel[popover.session.status]}
                </span>
              </div>

              {/* Session actions */}
              {currentUserId && role && popover.session.status === "proposed" && role === "student" && (
                <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
                  <Button
                    size="sm"
                    onClick={() => updateSession(popover.session.id, "confirmed")}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "confirm" ? "Confirming..." : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateSession(popover.session.id, "cancelled")}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "cancel" ? "Declining..." : "Decline"}
                  </Button>
                </div>
              )}
              {currentUserId && role && popover.session.status === "confirmed" && role !== "admin" && (
                <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
                  {role === "teacher" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRescheduleTarget(popover.session); setPopover(null); }}
                    >
                      Reschedule
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateSession(popover.session.id, "cancelled")}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "cancel" ? "Cancelling..." : "Cancel session"}
                  </Button>
                </div>
              )}
              {currentUserId && role === "teacher" && popover.session.status === "proposed" && (
                <div style={{ paddingTop: "4px" }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setRescheduleTarget(popover.session); setPopover(null); }}
                  >
                    Reschedule
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
