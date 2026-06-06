import type { Session } from "@/components/sessions/session-card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

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

export async function getTeacherDashboardData() {
  const profile = await requireRole(["teacher"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select(
      "id, student:student_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
    )
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false });

  const assignments = (data ?? []).map((assignment) => {
    const student = Array.isArray(assignment.student)
      ? assignment.student[0]
      : assignment.student;
    const rawConv = assignment.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    const sessions = (assignment.sessions ?? []) as Session[];
    return { ...assignment, student, conversation, sessions } as TeacherAssignmentRow;
  });

  return { profile, assignments };
}

export async function getStudentDashboardData() {
  const profile = await requireRole(["student"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select(
      "id, teacher:teacher_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
    )
    .eq("student_id", profile.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const assignments = (data ?? []).map((row) => {
    const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
    const rawConv = row.conversation;
    const conversation = Array.isArray(rawConv)
      ? rawConv
      : rawConv != null
        ? [rawConv as { id: string }]
        : null;
    const sessions = ((row.sessions ?? []) as Session[]).sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
    return { ...row, teacher, conversation, sessions } as StudentAssignmentRow;
  });

  return { profile, assignments };
}

export async function getAdminDashboardData() {
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
}
