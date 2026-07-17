import Link from "next/link";
import { Bot, CalendarDays, Link2, UserPlus } from "lucide-react";

import { AdminSessionsSection } from "@/components/admin/admin-sessions-section";
import { AdminStats } from "@/components/admin/admin-stats";
import { AssignStudentForm } from "@/components/admin/assign-student-form";
import { AssignmentsTable } from "@/components/admin/assignments-table";
import { ComposeEmailButton } from "@/components/admin/compose-email-button";
import { InviteUserForm } from "@/components/admin/invite-user-form";
import { ChatsPanel } from "@/components/chat/chats-panel";
import { ParentsTable } from "@/components/admin/parents-table";
import { StudentsTable } from "@/components/admin/students-table";
import { TeachersTable } from "@/components/admin/teachers-table";
import type {
  AdminAssignmentRow,
  AdminSession,
  Label,
  ParentStudentLink,
  ProfileRow,
  TeacherRow,
} from "@/lib/dashboard-data";

export type AdminDashboardView = "overview" | "users" | "assignments" | "sessions" | "chats";

interface AdminDashboardProps {
  view: AdminDashboardView;
  teachers: TeacherRow[];
  students: ProfileRow[];
  parents: ProfileRow[];
  assignments: AdminAssignmentRow[];
  sessions: AdminSession[];
  labels: Label[];
  links: ParentStudentLink[];
  currentUserId?: string;
}

const viewCopy: Record<AdminDashboardView, { title: string; description: string }> = {
  overview: {
    title: "Admin overview",
    description: "A quick read on people, pairings, and scheduled sessions.",
  },
  users: {
    title: "Users",
    description: "Invite teachers and students, and manage access.",
  },
  assignments: {
    title: "Assignments",
    description: "Create and manage teacher-student pairings.",
  },
  sessions: {
    title: "Sessions",
    description: "View every scheduled, pending, and past session.",
  },
  chats: {
    title: "Chats",
    description: "Message anyone at the academy, or start a group chat.",
  },
};

const overviewLinks = [
  {
    href: "/admin/users",
    icon: UserPlus,
    title: "Users",
    description: "Invite teachers and students, and manage access.",
  },
  {
    href: "/admin/assignments",
    icon: Link2,
    title: "Assignments",
    description: "Pair teachers with students and manage assignment status.",
  },
  {
    href: "/admin/sessions",
    icon: CalendarDays,
    title: "Sessions",
    description: "Track scheduled and pending sessions.",
  },
  {
    href: "/admin/hermes",
    icon: Bot,
    title: "Kitty",
    description: "Import WhatsApp contacts and review assistant activity.",
  },
];

function OverviewLinks() {
  return (
    <section className="form-grid-3" style={{ gap: "16px" }}>
      {overviewLinks.map(({ href, icon: Icon, title, description }) => (
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
              backgroundColor: "var(--color-accent-soft)",
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

export function AdminDashboard({
  view,
  teachers,
  students,
  parents,
  assignments,
  sessions,
  labels,
  links,
  currentUserId,
}: AdminDashboardProps) {
  const copy = viewCopy[view];
  const totalTeachers = teachers.length;
  const totalStudents = students.length;
  const totalAssignments = assignments.length;

  const parentIdsByStudent = new Map<string, string[]>();
  const childIdsByParent = new Map<string, string[]>();
  links.forEach((link) => {
    parentIdsByStudent.set(link.student_id, [...(parentIdsByStudent.get(link.student_id) ?? []), link.parent_id]);
    childIdsByParent.set(link.parent_id, [...(childIdsByParent.get(link.parent_id) ?? []), link.student_id]);
  });

  const studentsWithParents = students.map((student) => ({
    ...student,
    parentIds: parentIdsByStudent.get(student.id) ?? [],
  }));
  const parentsWithChildren = parents.map((parent) => ({
    ...parent,
    childIds: childIdsByParent.get(parent.id) ?? [],
  }));
  const studentOptions = students.map((s) => ({ id: s.id, full_name: s.full_name }));
  const parentOptions = parents.map((p) => ({ id: p.id, full_name: p.full_name }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1 className="text-2xl font-semibold text-navy">{copy.title}</h1>
          <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
            {copy.description}
          </p>
        </div>
        {view !== "chats" && <ComposeEmailButton teachers={teachers} students={students} />}
      </div>

      {view === "overview" && (
        <>
          <AdminStats stats={[
            { label: "Total teachers", value: totalTeachers },
            { label: "Total students", value: totalStudents },
            { label: "Active assignments", value: totalAssignments },
          ]} />
          <OverviewLinks />
        </>
      )}

      {view === "users" && (
        <>
          <InviteUserForm />

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Teachers</h2>
            <TeachersTable teachers={teachers} allLabels={labels} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Students</h2>
            <StudentsTable students={studentsWithParents} allParents={parentOptions} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Parents</h2>
            <ParentsTable parents={parentsWithChildren} allStudents={studentOptions} />
          </section>
        </>
      )}

      {view === "assignments" && (
        <>
          <AssignStudentForm teachers={teachers} students={students} allLabels={labels} />

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Assignments</h2>
            <AssignmentsTable assignments={assignments} />
          </section>
        </>
      )}

      {view === "sessions" && <AdminSessionsSection sessions={sessions} assignments={assignments} />}

      {view === "chats" && currentUserId && <ChatsPanel currentUserId={currentUserId} />}
    </div>
  );
}
