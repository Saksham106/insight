"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MessageSquare, Users } from "lucide-react";

import { ChatDrawer } from "@/components/chat/chat-drawer";
import { ChatsPanel } from "@/components/chat/chats-panel";
import { MonthCalendar } from "@/components/sessions/month-calendar";
import { SessionCard, type Session } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUnreadCounts } from "@/lib/use-unread-counts";

interface AssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

interface ParentChild {
  id: string;
  full_name: string;
  assignments: AssignmentRow[];
}

type ParentDashboardView = "overview" | "schedule" | "chats";

interface ParentDashboardProps {
  childProfiles: ParentChild[];
  parentId: string;
  view?: ParentDashboardView;
}

const viewCopy: Record<ParentDashboardView, { title: string; description: string }> = {
  overview: {
    title: "Parent overview",
    description: "Your children's teachers, sessions, and conversations at a glance.",
  },
  schedule: {
    title: "Schedule",
    description: "Every upcoming and past session across your children.",
  },
  chats: {
    title: "Chats",
    description: "Conversations with your children's teachers.",
  },
};

// A stable label for a conversation so a parent can tell which child + teacher it is.
function contactName(teacherName: string, childName: string) {
  return `${teacherName} · ${childName}`;
}

export function ParentDashboard({ childProfiles, parentId, view = "overview" }: ParentDashboardProps) {
  const [chatInitialId, setChatInitialId] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const now = new Date();

  const copy = viewCopy[view];

  // Flatten every conversation across all children into chat contacts.
  const chatContacts = useMemo(() => childProfiles.flatMap((child) =>
    child.assignments
      .filter((a) => a.conversation?.[0]?.id)
      .map((a) => ({
        conversationId: a.conversation![0].id,
        name: contactName(a.teacher?.full_name ?? "Teacher", child.full_name),
      })),
  ), [childProfiles]);
  const { unread: chatUnread, total: totalUnread } = useUnreadCounts(chatContacts);

  // All sessions across all children, tagged with teacher name for the calendar.
  const calendarSessions = childProfiles.flatMap((child) =>
    child.assignments.flatMap((a) =>
      a.sessions
        .filter((s) => s.status !== "cancelled")
        .map((s) => ({ ...s, teacherName: a.teacher?.full_name ?? undefined, studentName: child.full_name })),
    ),
  );

  const openConversation = (conversationId: string) => setChatInitialId(conversationId);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        <div>
          <h1 className="text-2xl font-semibold text-navy">{copy.title}</h1>
          <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
            {copy.description}
          </p>
        </div>

        {childProfiles.length === 0 && (
          <EmptyState
            icon={Users}
            title="No children linked yet"
            description="Your coordinator will link your children's accounts to yours soon."
          />
        )}

        {/* Overview unread banner */}
        {view === "overview" && totalUnread > 0 && (
          <section
            className="border border-border bg-surface"
            style={{
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <p className="text-sm font-semibold text-navy">
                {totalUnread} unread message{totalUnread !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted">You have new messages from your children&apos;s teachers.</p>
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
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 3px", fontSize: "10px", fontWeight: 700, backgroundColor: "var(--color-error)", color: "white" }}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            </Button>
          </section>
        )}

        {/* Overview: one panel per child */}
        {view === "overview" &&
          childProfiles.map((child) => {
            const upcoming = child.assignments
              .flatMap((a) =>
                a.sessions
                  .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) >= now)
                  .map((s) => ({ session: s, teacherName: a.teacher?.full_name ?? "Teacher" })),
              )
              .sort((x, y) => new Date(x.session.scheduled_at).getTime() - new Date(y.session.scheduled_at).getTime())
              .slice(0, 4);

            return (
              <section
                key={child.id}
                className="border border-border bg-surface"
                style={{ borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}
              >
                <h2 className="text-lg font-semibold text-navy">{child.full_name}</h2>

                {/* Teachers + open chat */}
                {child.assignments.length === 0 ? (
                  <EmptyState icon={Users} title="No teachers assigned" description={`${child.full_name} has no assigned teachers yet.`} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Teachers</p>
                    {child.assignments.map((a) => {
                      const convId = a.conversation?.[0]?.id;
                      const count = convId ? (chatUnread[convId] ?? 0) : 0;
                      return (
                        <div
                          key={a.id}
                          className="border border-border"
                          style={{ borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}
                        >
                          <p className="text-sm font-medium text-foreground">{a.teacher?.full_name ?? "Teacher"}</p>
                          {convId && (
                            <Button
                              size="sm"
                              onClick={() => openConversation(convId)}
                              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}
                            >
                              Open chat
                              {count > 0 && (
                                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "18px", height: "18px", borderRadius: "9999px", padding: "0 3px", fontSize: "10px", fontWeight: 700, backgroundColor: "var(--color-error)", color: "white" }}>
                                  {count > 99 ? "99+" : count}
                                </span>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upcoming sessions (read-only for parents) */}
                {upcoming.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Upcoming sessions</p>
                    {upcoming.map(({ session, teacherName }) => (
                      <div key={session.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <p className="text-xs font-medium text-muted">{teacherName}</p>
                        <SessionCard session={session} currentUserId={parentId} role="admin" />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

        {/* Schedule: aggregated calendar */}
        {view === "schedule" && childProfiles.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <MonthCalendar sessions={calendarSessions} currentUserId={parentId} role="admin" />
          </section>
        )}

        {/* Chats view — WhatsApp-style 1:1 + group conversations */}
        {view === "chats" && <ChatsPanel currentUserId={parentId} />}

        {view === "schedule" && childProfiles.length === 0 && (
          <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Sessions for your children will show up here." />
        )}
      </div>

      {chatInitialId && chatContacts.length > 0 && (
        <ChatDrawer
          contacts={chatContacts}
          initialConversationId={chatInitialId}
          currentUserId={parentId}
          onClose={() => setChatInitialId(null)}
        />
      )}
    </>
  );
}
