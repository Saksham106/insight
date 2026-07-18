"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { CalendarDays, Users } from "lucide-react";

import { AdminScheduleGroupForm } from "@/components/sessions/admin-schedule-group-form";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type AdminSession = Session & {
  teacherName: string;
  studentName: string;
  studentId: string | null;
  group_session_id: string | null;
};

interface AdminScheduleAssignment {
  id: string;
  is_active: boolean;
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
}

interface AdminSessionsSectionProps {
  sessions: AdminSession[];
  assignments: AdminScheduleAssignment[];
}

// A rendered list item: either a single session or a group class (>1 session
// sharing a group_session_id).
type ListItem =
  | { kind: "single"; session: AdminSession }
  | { kind: "group"; groupId: string; sessions: AdminSession[] };

function buildListItems(sessions: AdminSession[]): ListItem[] {
  const groups = new Map<string, AdminSession[]>();
  for (const s of sessions) {
    if (!s.group_session_id) continue;
    const list = groups.get(s.group_session_id) ?? [];
    list.push(s);
    groups.set(s.group_session_id, list);
  }

  const items: ListItem[] = [];
  const emitted = new Set<string>();
  for (const s of sessions) {
    const gid = s.group_session_id;
    if (gid && (groups.get(gid)?.length ?? 0) > 1) {
      if (emitted.has(gid)) continue;
      emitted.add(gid);
      items.push({ kind: "group", groupId: gid, sessions: groups.get(gid)! });
    } else {
      items.push({ kind: "single", session: s });
    }
  }
  return items;
}

export function AdminSessionsSection({ sessions, assignments }: AdminSessionsSectionProps) {
  const router = useRouter();
  const schedulableAssignments = assignments.filter((a) => a.is_active);
  const [view, setView] = useState<"entries" | "calendar">("entries");
  const [isMobile, setIsMobile] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeView = isMobile ? "entries" : view;
  const listItems = useMemo(() => buildListItems(sessions), [sessions]);

  const cancelGroup = async (groupId: string) => {
    setCancelling(groupId);
    const res = await fetch(`/api/sessions/group/${groupId}`, { method: "DELETE" });
    setCancelling(null);
    if (res.ok) router.refresh();
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <AdminScheduleGroupForm assignments={schedulableAssignments} />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="text-lg font-semibold text-navy">All sessions</h2>
          {!isMobile && (
            <div style={{ display: "flex", gap: "4px" }}>
              <Button size="sm" variant={view === "entries" ? "default" : "outline"} onClick={() => setView("entries")}>
                View as entries
              </Button>
              <Button size="sm" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>
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
              {listItems.map((item) =>
                item.kind === "single" ? (
                  <div key={item.session.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <p className="text-xs font-medium text-muted">
                      {item.session.teacherName} → {item.session.studentName}
                    </p>
                    <SessionCard session={item.session} currentUserId="" role="admin" />
                  </div>
                ) : (
                  <GroupSessionCard
                    key={item.groupId}
                    groupId={item.groupId}
                    sessions={item.sessions}
                    cancelling={cancelling === item.groupId}
                    onCancel={() => cancelGroup(item.groupId)}
                  />
                ),
              )}
            </div>
          )
        ) : (
          <MonthCalendar sessions={sessions} />
        )}
      </div>
    </section>
  );
}

function GroupSessionCard({
  groupId,
  sessions,
  cancelling,
  onCancel,
}: {
  groupId: string;
  sessions: AdminSession[];
  cancelling: boolean;
  onCancel: () => void;
}) {
  const first = sessions[0];
  const start = new Date(first.scheduled_at);
  const end = new Date(start.getTime() + first.duration_minutes * 60 * 1000);
  const dateStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const allCancelled = sessions.every((s) => s.status === "cancelled");
  const students = sessions.map((s) => s.studentName);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <p className="text-xs font-medium text-muted" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <Users size={12} /> {first.teacherName} · group class · {students.length} students
      </p>
      <div
        className="border border-border bg-surface"
        style={{ borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", opacity: allCancelled ? 0.55 : 1 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <p className="text-sm font-semibold text-navy">{dateStr}</p>
            <p className="text-sm text-muted">{startTime} – {endTime} · {first.duration_minutes} min</p>
          </div>
          {allCancelled ? (
            <span className="text-xs font-medium text-muted">Cancelled</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelling}
              onClick={onCancel}
              style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
            >
              {cancelling ? "Cancelling…" : "Cancel class"}
            </Button>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {students.map((name, i) => (
            <span
              key={`${groupId}-${i}`}
              style={{ padding: "3px 10px", borderRadius: "9999px", background: "var(--color-accent-soft)", color: "var(--color-navy)", fontSize: "12px", fontWeight: 500 }}
            >
              {name}
            </span>
          ))}
        </div>
        {first.notes && <p className="text-sm text-muted">{first.notes}</p>}
      </div>
    </div>
  );
}
