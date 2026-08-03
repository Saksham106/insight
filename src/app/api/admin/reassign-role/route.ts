import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  describeImpact,
  planReassignment,
  reassignmentError,
  type ReassignPlan,
  type RelationshipCounts,
} from "@/lib/admin/role-reassign";

type AdminClient = ReturnType<typeof createAdminClient>;

async function countRow(
  admin: AdminClient,
  table: "teacher_student_assignments" | "parent_student_links",
  column: string,
  userId: string,
  activeOnly: boolean,
): Promise<number> {
  let query = admin.from(table).select("*", { count: "exact", head: true }).eq(column, userId);
  if (activeOnly) query = query.eq("is_active", true);
  const { count } = await query;
  return count ?? 0;
}

// Only count what the plan will actually touch — the rest stays zero and is
// left out of the confirm step entirely.
async function countImpacted(
  admin: AdminClient,
  userId: string,
  plan: ReassignPlan,
): Promise<RelationshipCounts> {
  return {
    assignmentsAsTeacher: plan.deactivateAssignmentsAsTeacher
      ? await countRow(admin, "teacher_student_assignments", "teacher_id", userId, true)
      : 0,
    assignmentsAsStudent: plan.deactivateAssignmentsAsStudent
      ? await countRow(admin, "teacher_student_assignments", "student_id", userId, true)
      : 0,
    parentLinksAsParent: plan.removeParentLinksAsParent
      ? await countRow(admin, "parent_student_links", "parent_id", userId, false)
      : 0,
    parentLinksAsStudent: plan.removeParentLinksAsStudent
      ? await countRow(admin, "parent_student_links", "student_id", userId, false)
      : 0,
  };
}

// Correct a miscategorised person: someone invited as a student who is really a
// parent, a parent who is really a tutor, and so on. Which relationships stop
// making sense is decided by the pure planner in @/lib/admin/role-reassign;
// this route only carries the plan out.
//
// `preview: true` reports what would change and writes nothing, so the confirm
// step can name the exact consequences before the admin commits.
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const role = typeof body?.role === "string" ? body.role : null;
  const preview = body?.preview === true;

  if (!userId || !role) {
    return NextResponse.json({ error: "Missing user id or role." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const from = target.role as string;
  const guard = reassignmentError({ from, to: role, isSelf: userId === profile.id });
  if (guard) {
    return NextResponse.json({ error: guard }, { status: 400 });
  }

  const plan = planReassignment(from, role);
  const counts = await countImpacted(admin, userId, plan);

  if (preview) {
    return NextResponse.json({
      fromRole: from,
      toRole: role,
      fullName: target.full_name as string,
      impact: describeImpact(plan, counts),
    });
  }

  // Assignments are deactivated rather than deleted: sessions and the lesson
  // ledger reference them, and ensureAssignments already treats an inactive row
  // as something to reactivate if the pairing comes back.
  if (plan.deactivateAssignmentsAsTeacher) {
    const { error } = await admin
      .from("teacher_student_assignments")
      .update({ is_active: false })
      .eq("teacher_id", userId)
      .eq("is_active", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (plan.deactivateAssignmentsAsStudent) {
    const { error } = await admin
      .from("teacher_student_assignments")
      .update({ is_active: false })
      .eq("student_id", userId)
      .eq("is_active", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // parent_student_links carry no history and have no active flag, so they go.
  if (plan.removeParentLinksAsParent) {
    const { error } = await admin.from("parent_student_links").delete().eq("parent_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (plan.removeParentLinksAsStudent) {
    const { error } = await admin.from("parent_student_links").delete().eq("student_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The role itself goes last: if anything above failed we stopped, leaving the
  // person in their old role with their relationships consistent with it.
  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ success: true, impact: describeImpact(plan, counts) });
}
