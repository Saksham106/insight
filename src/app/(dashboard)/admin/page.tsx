import { AdminFormsGrid } from "@/components/admin/admin-forms-grid";
import { AdminSessionsSection } from "@/components/admin/admin-sessions-section";
import { AdminStats } from "@/components/admin/admin-stats";
import { AssignStudentForm } from "@/components/admin/assign-student-form";
import { AssignmentsTable } from "@/components/admin/assignments-table";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { CreateTeacherForm } from "@/components/admin/create-teacher-form";
import { StudentsTable } from "@/components/admin/students-table";
import { TeachersTable } from "@/components/admin/teachers-table";
import type { Session } from "@/components/sessions/session-card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createServerClientWithBypass();

  const [teachersResult, studentsResult, assignmentsResult, sessionsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, is_active, created_at")
        .eq("role", "teacher")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, is_active, created_at")
        .eq("role", "student")
        .order("created_at", { ascending: false }),
      supabase
        .from("teacher_student_assignments")
        .select(
          "id, created_at, is_active, teacher:teacher_id (id, full_name), student:student_id (id, full_name), conversation:conversations (id)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("sessions")
        .select(
          "id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by, assignment:assignment_id (teacher:teacher_id (full_name), student:student_id (full_name))",
        )
        .order("scheduled_at", { ascending: true }),
    ]);

  type ProfileRow = {
    id: string;
    full_name: string;
    is_active: boolean;
    created_at: string;
  };

  type AssignmentRow = {
    id: string;
    created_at: string;
    is_active: boolean;
    teacher: { id: string; full_name: string } | null;
    student: { id: string; full_name: string } | null;
    conversation: { id: string }[] | null;
  };

  const teachers = (teachersResult.data ?? []) as ProfileRow[];
  const students = (studentsResult.data ?? []) as ProfileRow[];
  const assignments = (assignmentsResult.data ?? []).map((assignment) => {
    const teacher = Array.isArray(assignment.teacher)
      ? assignment.teacher[0]
      : assignment.teacher;
    const student = Array.isArray(assignment.student)
      ? assignment.student[0]
      : assignment.student;
    const rawConv = assignment.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    return {
      ...assignment,
      teacher,
      student,
      conversation,
    } as AssignmentRow;
  });

  type AdminSession = Session & { teacherName: string; studentName: string };

  const sessions = (sessionsResult.data ?? []).map((s) => {
    const asgn = Array.isArray(s.assignment) ? s.assignment[0] : s.assignment;
    const teacher = Array.isArray(asgn?.teacher) ? asgn.teacher[0] : asgn?.teacher;
    const student = Array.isArray(asgn?.student) ? asgn.student[0] : asgn?.student;
    return {
      id: s.id,
      assignment_id: s.assignment_id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      notes: s.notes,
      status: s.status,
      teacherName: (teacher as { full_name: string } | null)?.full_name ?? "Teacher",
      studentName: (student as { full_name: string } | null)?.full_name ?? "Student",
    } as AdminSession;
  });

  const totalTeachers = teachers?.length ?? 0;
  const totalStudents = students?.length ?? 0;
  const totalAssignments = assignments?.length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      <AdminStats stats={[
        { label: "Total teachers", value: totalTeachers },
        { label: "Total students", value: totalStudents },
        { label: "Active assignments", value: totalAssignments },
      ]} />

      <AdminFormsGrid>
        <CreateTeacherForm />
        <CreateStudentForm />
      </AdminFormsGrid>

      <AssignStudentForm
        teachers={teachers}
        students={students}
      />

      <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 className="text-lg font-semibold text-navy">Teachers</h2>
        <TeachersTable teachers={teachers} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 className="text-lg font-semibold text-navy">Students/Parents</h2>
        <StudentsTable students={students} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 className="text-lg font-semibold text-navy">Assignments</h2>
        <AssignmentsTable assignments={assignments} />
      </section>

      <AdminSessionsSection sessions={sessions} />
    </div>
  );
}
