import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { Session } from "@/components/sessions/session-card";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TeacherAssignmentRow {
  id: string;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

export interface StudentAssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
  sessions: Session[];
}

export interface ProfileRow {
  id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminAssignmentRow {
  id: string;
  created_at: string;
  is_active: boolean;
  teacher: { id: string; full_name: string } | null;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
}

export type AdminSession = Session & { teacherName: string; studentName: string };

const fetchTeacherAssignments = (teacherId: string) =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("teacher_student_assignments")
        .select(
          "id, student:student_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
        )
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });
      return (data ?? []).map((assignment) => {
        const student = Array.isArray(assignment.student) ? assignment.student[0] : assignment.student;
        const rawConv = assignment.conversation;
        const conversation = Array.isArray(rawConv) ? rawConv : rawConv != null ? [rawConv as { id: string }] : null;
        const sessions = (assignment.sessions ?? []) as Session[];
        return { ...assignment, student, conversation, sessions } as TeacherAssignmentRow;
      });
    },
    [`teacher-assignments-${teacherId}`],
    { revalidate: 60, tags: ["dashboard", `user-${teacherId}`] },
  )();

export const getTeacherDashboardData = cache(async function getTeacherDashboardData() {
  const profile = await requireRole(["teacher"]);
  const assignments = await fetchTeacherAssignments(profile.id);
  return { profile, assignments };
});

const fetchStudentAssignments = (studentId: string) =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("teacher_student_assignments")
        .select(
          "id, teacher:teacher_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
        )
        .eq("student_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      return (data ?? []).map((row) => {
        const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
        const rawConv = row.conversation;
        const conversation = Array.isArray(rawConv) ? rawConv : rawConv != null ? [rawConv as { id: string }] : null;
        const sessions = ((row.sessions ?? []) as Session[]).sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
        );
        return { ...row, teacher, conversation, sessions } as StudentAssignmentRow;
      });
    },
    [`student-assignments-${studentId}`],
    { revalidate: 60, tags: ["dashboard", `user-${studentId}`] },
  )();

export const getStudentDashboardData = cache(async function getStudentDashboardData() {
  const profile = await requireRole(["student"]);
  const assignments = await fetchStudentAssignments(profile.id);
  return { profile, assignments };
});

const fetchAdminData = unstable_cache(
  async () => {
    const supabase = await createAdminClient();
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
    } as AdminAssignmentRow;
  });

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
      proposed_by: s.proposed_by,
      teacherName: (teacher as { full_name: string } | null)?.full_name ?? "Teacher",
      studentName: (student as { full_name: string } | null)?.full_name ?? "Student",
    } as AdminSession;
  });

    return { teachers, students, assignments, sessions };
  },
  ["admin-dashboard"],
  { revalidate: 60, tags: ["dashboard", "admin-dashboard"] },
);

export const getAdminDashboardData = cache(async function getAdminDashboardData() {
  await requireRole(["admin"]);
  return fetchAdminData();
});
