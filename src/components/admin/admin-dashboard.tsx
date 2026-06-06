import Link from "next/link";
import { CalendarDays, GitBranch, UserPlus } from "lucide-react";

import { AdminFormsGrid } from "@/components/admin/admin-forms-grid";
import { AdminSessionsSection } from "@/components/admin/admin-sessions-section";
import { AdminStats } from "@/components/admin/admin-stats";
import { AssignStudentForm } from "@/components/admin/assign-student-form";
import { AssignmentsTable } from "@/components/admin/assignments-table";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { CreateTeacherForm } from "@/components/admin/create-teacher-form";
import { StudentsTable } from "@/components/admin/students-table";
import { TeachersTable } from "@/components/admin/teachers-table";
import type {
  AdminAssignmentRow,
  AdminSession,
  ProfileRow,
} from "@/lib/dashboard-data";

export type AdminDashboardView = "overview" | "users" | "assignments" | "sessions";

interface AdminDashboardProps {
  view: AdminDashboardView;
  teachers: ProfileRow[];
  students: ProfileRow[];
  assignments: AdminAssignmentRow[];
  sessions: AdminSession[];
}

const viewCopy: Record<AdminDashboardView, { title: string; description: string }> = {
  overview: {
    title: "Admin overview",
    description: "A quick read on people, pairings, and scheduled sessions.",
  },
  users: {
    title: "Users",
    description: "Invite teachers and students, then manage account access.",
  },
  assignments: {
    title: "Assignments",
    description: "Pair students with teachers and open existing conversations.",
  },
  sessions: {
    title: "Sessions",
    description: "Review every scheduled, pending, and past session.",
  },
};

const overviewLinks = [
  {
    href: "/admin/users",
    icon: UserPlus,
    title: "Users",
    description: "Invite and manage teachers and students.",
  },
  {
    href: "/admin/assignments",
    icon: GitBranch,
    title: "Assignments",
    description: "Create pairings and monitor conversations.",
  },
  {
    href: "/admin/sessions",
    icon: CalendarDays,
    title: "Sessions",
    description: "Track scheduled and pending sessions.",
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

export function AdminDashboard({
  view,
  teachers,
  students,
  assignments,
  sessions,
}: AdminDashboardProps) {
  const copy = viewCopy[view];
  const totalTeachers = teachers.length;
  const totalStudents = students.length;
  const totalAssignments = assignments.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div>
        <h1 className="text-2xl font-semibold text-navy">{copy.title}</h1>
        <p className="text-sm text-muted" style={{ marginTop: "4px" }}>
          {copy.description}
        </p>
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
          <AdminFormsGrid>
            <CreateTeacherForm />
            <CreateStudentForm />
          </AdminFormsGrid>

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Teachers</h2>
            <TeachersTable teachers={teachers} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Students/Parents</h2>
            <StudentsTable students={students} />
          </section>
        </>
      )}

      {view === "assignments" && (
        <>
          <AssignStudentForm teachers={teachers} students={students} />

          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 className="text-lg font-semibold text-navy">Assignments</h2>
            <AssignmentsTable assignments={assignments} />
          </section>
        </>
      )}

      {view === "sessions" && <AdminSessionsSection sessions={sessions} />}
    </div>
  );
}
