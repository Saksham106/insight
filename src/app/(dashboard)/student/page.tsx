import { CalendarDays } from "lucide-react";

import { ChatButton } from "@/components/chat/chat-button";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestSessionForm } from "@/components/sessions/request-session-form";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

interface AssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

export default async function StudentPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select(
      "id, teacher:teacher_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
    )
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });

  const assignmentRaw = (data?.[0] ?? null);
  const teacher = assignmentRaw
    ? Array.isArray(assignmentRaw.teacher)
      ? assignmentRaw.teacher[0]
      : assignmentRaw.teacher
    : null;
  const rawConv = assignmentRaw?.conversation;
  const conversation = Array.isArray(rawConv)
    ? rawConv
    : rawConv != null
      ? [rawConv as { id: string }]
      : null;
  const sessions = ((assignmentRaw?.sessions ?? []) as Session[]).sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  const assignment = assignmentRaw
    ? ({ ...assignmentRaw, teacher, conversation, sessions } as AssignmentRow)
    : null;

  const conversationId = assignment?.conversation?.[0]?.id;

  // Teacher-proposed sessions awaiting student confirmation
  const pendingSessions = sessions.filter(
    (s) => s.status === "proposed" && (s.proposed_by === null || s.proposed_by !== profile.id),
  );
  // Student's own pending requests awaiting teacher confirmation
  const myRequests = sessions.filter(
    (s) => s.status === "proposed" && s.proposed_by === profile.id,
  );
  const upcomingSessions = sessions.filter(
    (s) => s.status === "confirmed" && new Date(s.scheduled_at) >= new Date(),
  );
  const calendarSessions = sessions.filter((s) => s.status !== "cancelled");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div>
        <h1 className="text-2xl font-semibold text-navy">Welcome back</h1>
        <p className="text-sm text-muted">
          Your tutoring sessions and conversations, all in one place.
        </p>
      </div>

      {/* Teacher card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Assigned teacher</CardTitle>
        </CardHeader>
        <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="text-lg font-medium">
            {assignment?.teacher?.full_name ?? "Not assigned yet"}
          </p>
          {conversationId ? (
            <ChatButton
              conversationId={conversationId}
              currentUserId={profile.id}
              title={`Chat with ${assignment?.teacher?.full_name ?? "your teacher"}`}
            />
          ) : (
            <p className="text-sm text-muted">
              Your admin will assign a teacher soon.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Request a session */}
      {assignment && (
        <RequestSessionForm
          assignmentId={assignment.id}
          studentId={profile.id}
          teacherName={assignment.teacher?.full_name ?? "your teacher"}
        />
      )}

      {/* No sessions at all */}
      {assignment && myRequests.length === 0 && pendingSessions.length === 0 && upcomingSessions.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No sessions yet"
          description="Your teacher will schedule your first session, or you can request one above."
        />
      )}

      {/* Student's own pending requests awaiting teacher confirmation */}
      {myRequests.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">Your pending requests</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {myRequests.map((s) => (
              <SessionCard key={s.id} session={s} currentUserId={profile.id} role="student" />
            ))}
          </div>
        </section>
      )}

      {/* Teacher-proposed sessions awaiting student confirmation */}
      {pendingSessions.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">
            Sessions awaiting your confirmation
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendingSessions.map((s) => (
              <SessionCard key={s.id} session={s} currentUserId={profile.id} role="student" />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming confirmed sessions */}
      {upcomingSessions.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 className="text-lg font-semibold text-navy">Upcoming sessions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {upcomingSessions.map((s) => (
              <SessionCard key={s.id} session={s} currentUserId={profile.id} role="student" />
            ))}
          </div>
        </section>
      )}

      {/* Calendar */}
      <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 className="text-lg font-semibold text-navy">Calendar</h2>
        <MonthCalendar sessions={calendarSessions} currentUserId={profile.id} role="student" />
      </section>
    </div>
  );
}
