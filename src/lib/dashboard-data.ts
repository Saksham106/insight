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

interface RawProfileRow {
  id: string;
  full_name: string;
  is_active: boolean;
  invite_sent_at: string | null;
  password_set_at: string | null;
  created_at: string;
}

export interface ProfileRow extends RawProfileRow {
  email: string;
  auth_last_sign_in_at: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string | null;
}

export interface TeacherRow extends ProfileRow {
  labels: Label[];
}

export interface ParentStudentLink {
  parent_id: string;
  student_id: string;
}

export interface ParentChild {
  id: string;
  full_name: string;
  assignments: StudentAssignmentRow[];
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

interface AuthUserOnboardingState {
  email: string | null;
  last_sign_in_at: string | null;
}

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

function normalizeStudentAssignments(rows: unknown[]): StudentAssignmentRow[] {
  return (rows as Record<string, unknown>[]).map((row) => {
    const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
    const rawConv = row.conversation;
    const conversation = Array.isArray(rawConv) ? rawConv : rawConv != null ? [rawConv as { id: string }] : null;
    const sessions = ((row.sessions ?? []) as Session[]).sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
    return { ...row, teacher, conversation, sessions } as StudentAssignmentRow;
  });
}

// The admin client bypasses RLS, so parent access MUST be scoped here by
// filtering strictly through parent_student_links for the authenticated parent.
const fetchParentChildren = (parentId: string) =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student:student_id (id, full_name)")
        .eq("parent_id", parentId);

      const children = (links ?? [])
        .map((link) => (Array.isArray(link.student) ? link.student[0] : link.student))
        .filter((child): child is { id: string; full_name: string } => Boolean(child))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      return Promise.all(
        children.map(async (child) => {
          const { data } = await supabase
            .from("teacher_student_assignments")
            .select(
              "id, teacher:teacher_id (id, full_name), conversation:conversations (id), sessions (id, assignment_id, scheduled_at, duration_minutes, notes, status, proposed_by)",
            )
            .eq("student_id", child.id)
            .eq("is_active", true)
            .order("created_at", { ascending: true });

          return {
            id: child.id,
            full_name: child.full_name,
            assignments: normalizeStudentAssignments(data ?? []),
          } satisfies ParentChild;
        }),
      );
    },
    [`parent-children-${parentId}`],
    { revalidate: 60, tags: ["dashboard", `user-${parentId}`] },
  )();

export const getParentDashboardData = cache(async function getParentDashboardData() {
  const profile = await requireRole(["parent"]);
  const children = await fetchParentChildren(profile.id);
  return { profile, children };
});

const fetchAdminData = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [
      teachersResult,
      studentsResult,
      parentsResult,
      assignmentsResult,
      sessionsResult,
      labelsResult,
      teacherLabelsResult,
      linksResult,
    ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, is_active, invite_sent_at, password_set_at, created_at")
      .eq("role", "teacher")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, is_active, invite_sent_at, password_set_at, created_at")
      .eq("role", "student")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, is_active, invite_sent_at, password_set_at, created_at")
      .eq("role", "parent")
      .is("deleted_at", null)
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
    supabase.from("labels").select("id, name, color").order("name", { ascending: true }),
    supabase.from("teacher_labels").select("teacher_id, label:label_id (id, name, color)"),
    supabase.from("parent_student_links").select("parent_id, student_id"),
  ]);

  const authUsersResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUsersById = new Map(
    (authUsersResult.data?.users ?? []).map((user) => [
      user.id,
      {
        email: user.email ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      } satisfies AuthUserOnboardingState,
    ]),
  );

  const withAuthOnboardingState = (rows: RawProfileRow[]) =>
    rows.map((row) => {
      const authUser = authUsersById.get(row.id);

      return {
        ...row,
        email: authUser?.email ?? "",
        auth_last_sign_in_at: authUser?.last_sign_in_at ?? null,
      } satisfies ProfileRow;
    });

  const labels = (labelsResult.data ?? []) as Label[];

  const labelsByTeacher = new Map<string, Label[]>();
  ((teacherLabelsResult.data ?? []) as { teacher_id: string; label: Label | Label[] | null }[]).forEach((row) => {
    const label = Array.isArray(row.label) ? row.label[0] : row.label;
    if (!label) return;
    const existing = labelsByTeacher.get(row.teacher_id) ?? [];
    existing.push(label);
    labelsByTeacher.set(row.teacher_id, existing);
  });

  const teachers = withAuthOnboardingState((teachersResult.data ?? []) as RawProfileRow[]).map(
    (teacher) =>
      ({
        ...teacher,
        labels: (labelsByTeacher.get(teacher.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }) satisfies TeacherRow,
  );
  const students = withAuthOnboardingState((studentsResult.data ?? []) as RawProfileRow[]);
  const parents = withAuthOnboardingState((parentsResult.data ?? []) as RawProfileRow[]);
  const links = (linksResult.data ?? []) as ParentStudentLink[];
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

    return { teachers, students, parents, assignments, sessions, labels, links };
  },
  ["admin-dashboard"],
  { revalidate: 60, tags: ["dashboard", "admin-dashboard"] },
);

export const getAdminDashboardData = cache(async function getAdminDashboardData() {
  await requireRole(["admin"]);
  return fetchAdminData();
});
