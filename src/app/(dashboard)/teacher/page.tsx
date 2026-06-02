import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

interface AssignmentRow {
  id: string;
  student: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
}

export default async function TeacherPage() {
  const profile = await requireRole(["teacher"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select("id, student:student_id (id, full_name), conversation:conversations (id)")
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false });

  const assignments = (data ?? []).map((assignment) => {
    const student = Array.isArray(assignment.student)
      ? assignment.student[0]
      : assignment.student;
    return { ...assignment, student } as AssignmentRow;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Welcome back</h1>
        <p className="text-sm text-muted">
          Here are your assigned students and conversations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {assignments.map((assignment) => {
          const conversationId = assignment.conversation?.[0]?.id;
          return (
            <Card key={assignment.id}>
              <CardHeader>
                <CardTitle className="text-base text-navy">
                  {assignment.student?.full_name ?? "Student"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted">Assigned student</span>
                {conversationId ? (
                  <Button asChild size="sm">
                    <Link href={`/chat/${conversationId}`}>Open chat</Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted">Chat pending</span>
                )}
              </CardContent>
            </Card>
          );
        })}

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted">
              No students assigned yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
