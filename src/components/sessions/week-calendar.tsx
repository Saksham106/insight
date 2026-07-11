"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekGrid, type WeekGridBlock } from "@/components/calendar/week-grid";
import type { Session } from "./session-card";

type CalendarSession = Session & { studentName?: string; teacherName?: string };

interface WeekCalendarProps {
  sessions: CalendarSession[];
  onSlotSelect?: (start: Date, end: Date) => void;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const VARIANT_BY_STATUS: Record<Session["status"], WeekGridBlock["variant"]> = {
  confirmed: "session",
  proposed: "available",
  cancelled: "slot",
};

export function WeekCalendar({ sessions, onSlotSelect }: WeekCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);

  const blocks: WeekGridBlock[] = sessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return d >= weekStart && d < weekEnd && s.status !== "cancelled";
    })
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      return {
        id: s.id,
        start,
        end: new Date(start.getTime() + s.duration_minutes * 60000),
        variant: VARIANT_BY_STATUS[s.status],
        label: time,
        subLabel: s.studentName ?? s.teacherName,
        readOnly: true,
      };
    });

  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="text-sm font-medium text-muted">{weekLabel}</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        editable={Boolean(onSlotSelect)}
        onEmptyClick={onSlotSelect}
        onCreate={onSlotSelect}
      />
    </div>
  );
}
