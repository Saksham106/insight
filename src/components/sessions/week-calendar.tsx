"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Session } from "./session-card";

type CalendarSession = Session & { studentName?: string };

interface WeekCalendarProps {
  sessions: CalendarSession[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const statusStyle: Record<Session["status"], React.CSSProperties> = {
  confirmed: { borderLeftColor: "#12304a", backgroundColor: "#eaf2f8" },
  proposed: { borderLeftColor: "#d8a24a", backgroundColor: "#f6e8c8" },
  cancelled: { borderLeftColor: "#d9e2ec", backgroundColor: "#f8fafc", opacity: 0.5 },
};

const statusTextColor: Record<Session["status"], string> = {
  confirmed: "text-navy",
  proposed: "text-warning",
  cancelled: "text-muted line-through",
};

function getMonday(date: Date): Date {
  const utcTs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const utcDow = new Date(utcTs).getUTCDay();
  const daysBack = utcDow === 0 ? 6 : utcDow - 1;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const GRID_7: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};

const BORDER_RIGHT = "1px solid var(--color-border)";
const BORDER_BOTTOM = "1px solid var(--color-border)";

export function WeekCalendar({ sessions }: WeekCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekLabel = `${weekStart.toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="text-sm font-medium text-muted">{weekLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(getMonday(new Date()))}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div style={{ overflow: "hidden", borderRadius: "12px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        {/* Day headers */}
        <div style={{ ...GRID_7, borderBottom: BORDER_BOTTOM, backgroundColor: "var(--color-background)" }}>
          {days.map((day, i) => {
            const isToday = sameDay(day, today);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "12px 0",
                  borderRight: i < 6 ? BORDER_RIGHT : undefined,
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {DAY_LABELS[i]}
                </p>
                <div
                  style={{
                    marginTop: "4px",
                    display: "flex",
                    height: "28px",
                    width: "28px",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    backgroundColor: isToday ? "var(--color-navy)" : undefined,
                  }}
                  className={cn("text-sm font-semibold", isToday ? "text-white" : "text-foreground")}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day session columns */}
        <div style={GRID_7}>
          {days.map((day, i) => {
            const isToday = sameDay(day, today);
            const daySessions = sessions.filter((s) =>
              sameDay(new Date(s.scheduled_at), day),
            );

            return (
              <div
                key={i}
                className={isToday ? "bg-soft" : ""}
                style={{
                  minHeight: "80px",
                  padding: "6px",
                  borderRight: i < 6 ? BORDER_RIGHT : undefined,
                  opacity: isToday ? undefined : 1,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {daySessions.map((s) => {
                    const time = new Date(s.scheduled_at).toLocaleTimeString("en-CA", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });
                    return (
                      <div
                        key={s.id}
                        style={{ borderLeftWidth: "3px", borderLeftStyle: "solid", ...statusStyle[s.status] }}
                        className="rounded-r-md px-1.5 py-1 text-[10px] leading-snug"
                      >
                        <p className={cn("font-semibold", statusTextColor[s.status])}>
                          {time}
                        </p>
                        {s.studentName && (
                          <p className="truncate text-muted">{s.studentName}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
