import { AssignStudentForm } from "@/components/admin/assign-student-form";
import { AssignmentsTable } from "@/components/admin/assignments-table";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { CreateTeacherForm } from "@/components/admin/create-teacher-form";
import { StudentsTable } from "@/components/admin/students-table";
import { TeachersTable } from "@/components/admin/teachers-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createServerClientWithBypass();

  const [teachersResult, studentsResult, assignmentsResult] = await Promise.all([
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
          "id, created_at, teacher:teacher_id (id, full_name), student:student_id (id, full_name), conversation:conversations (id)",
        )
        .order("created_at", { ascending: false }),
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
    return {
      ...assignment,
      teacher,
      student,
    } as AssignmentRow;
  });

  const totalTeachers = teachers?.length ?? 0;
  const totalStudents = students?.length ?? 0;
  const totalAssignments = assignments?.length ?? 0;

  return (
    <div className="space-y-10">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Total teachers", value: totalTeachers },
          { label: "Total students", value: totalStudents },
          { label: "Active assignments", value: totalAssignments },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-navy">
              {stat.value}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CreateTeacherForm />
        <CreateStudentForm />
      </section>

      <AssignStudentForm
        teachers={teachers}
        students={students}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Teachers</h2>
        <TeachersTable teachers={teachers} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Students/Parents</h2>
        <StudentsTable students={students} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Assignments</h2>
        <AssignmentsTable assignments={assignments} />
      </section>
    </div>
  );
}
