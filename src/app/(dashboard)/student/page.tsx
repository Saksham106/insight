import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/require-role";
import { createServerClientWithBypass } from "@/lib/supabase/server";

interface AssignmentRow {
  id: string;
  teacher: { id: string; full_name: string } | null;
  conversation: { id: string }[] | null;
}

export default async function StudentPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createServerClientWithBypass();

  const { data } = await supabase
    .from("teacher_student_assignments")
    .select("id, teacher:teacher_id (id, full_name), conversation:conversations (id)")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });

  const assignmentRaw = (data?.[0] ?? null) as AssignmentRow | null;
  const teacher = assignmentRaw
    ? Array.isArray(assignmentRaw.teacher)
      ? assignmentRaw.teacher[0]
      : assignmentRaw.teacher
    : null;
  const assignment = assignmentRaw
    ? ({ ...assignmentRaw, teacher } as AssignmentRow)
    : null;
  const conversationId = assignment?.conversation?.[0]?.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Welcome back</h1>
        <p className="text-sm text-muted">
          Your private tutoring conversation stays in one secure place.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Assigned teacher</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-lg font-medium">
            {assignment?.teacher?.full_name ?? "Not assigned yet"}
          </p>
          {conversationId ? (
            <Button asChild className="w-fit">
              <Link href={`/chat/${conversationId}`}>Open chat</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted">
              Your admin will assign a teacher soon.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
