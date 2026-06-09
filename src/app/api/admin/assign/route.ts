import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const profile = await getUserProfile();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const teacherId = body.teacherId?.toString();
  const studentId = body.studentId?.toString();

  if (!teacherId || !studentId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existingAssignment } = await supabase
    .from("teacher_student_assignments")
    .select("id, is_active")
    .eq("teacher_id", teacherId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (existingAssignment) {
    if (!existingAssignment.is_active) {
      const { error: reactivateError } = await supabase
        .from("teacher_student_assignments")
        .update({ is_active: true })
        .eq("id", existingAssignment.id);

      if (reactivateError) {
        return NextResponse.json({ error: reactivateError.message }, { status: 500 });
      }

      const convError = await ensureConversation(supabase, existingAssignment.id);
      if (convError) {
        return NextResponse.json({ error: convError.message }, { status: 500 });
      }

      revalidateDashboards();

      return NextResponse.json({
        assignmentId: existingAssignment.id,
        reactivated: true,
      });
    }

    return NextResponse.json(
      { error: "This teacher is already assigned to this student." },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("teacher_student_assignments")
    .insert({ teacher_id: teacherId, student_id: studentId })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const convError = await ensureConversation(supabase, data.id);

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  revalidateDashboards();

  return NextResponse.json({ assignmentId: data.id });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensureConversation(supabase: AdminClient, assignmentId: string) {
  const { data: existingConversation, error: lookupError } = await supabase
    .from("conversations")
    .select("id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (lookupError) return lookupError;
  if (existingConversation) return null;

  const { error } = await supabase
    .from("conversations")
    .insert({ assignment_id: assignmentId });

  return error;
}

function revalidateDashboards() {
  revalidateTag("dashboard", "max");
  revalidateTag("admin-dashboard", "max");
}
