import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_student_assignments")
    .insert({ teacher_id: teacherId, student_id: studentId })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: convError } = await supabase
    .from("conversations")
    .insert({ assignment_id: data.id });

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  return NextResponse.json({ assignmentId: data.id });
}
