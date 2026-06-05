"use client";

import { useState, useEffect } from "react";

import { CalendarDays } from "lucide-react";

import { MonthCalendar } from "@/components/sessions/month-calendar";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type AdminSession = Session & { teacherName: string; studentName: string };

interface AdminSessionsSectionProps {
  sessions: AdminSession[];
}

export function AdminSessionsSection({ sessions }: AdminSessionsSectionProps) {
  const [view, setView] = useState<"entries" | "calendar">("entries");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeView = isMobile ? "entries" : view;

  const calendarSessions = sessions.map((s) => ({
    ...s,
    studentName: s.studentName,
    teacherName: s.teacherName,
  }));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="text-lg font-semibold text-navy">All sessions</h2>
        {!isMobile && (
          <div style={{ display: "flex", gap: "4px" }}>
            <Button
              size="sm"
              variant={view === "entries" ? "default" : "outline"}
              onClick={() => setView("entries")}
            >
              View as entries
            </Button>
            <Button
              size="sm"
              variant={view === "calendar" ? "default" : "outline"}
              onClick={() => setView("calendar")}
            >
              View as calendar
            </Button>
          </div>
        )}
      </div>

      {activeView === "entries" ? (
        sessions.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No sessions yet" description="Sessions will appear here once teachers and students start scheduling." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {sessions.map((s) => (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <p className="text-xs font-medium text-muted">
                  {s.teacherName} → {s.studentName}
                </p>
                <SessionCard session={s} currentUserId="" role="admin" />
              </div>
            ))}
          </div>
        )
      ) : (
        <MonthCalendar sessions={calendarSessions} />
      )}

    </section>
  );
}
