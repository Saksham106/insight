import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  describeImpact,
  planReassignment,
  reassignmentError,
  type RelationshipCounts,
} from "@/lib/admin/role-reassign";

interface ReassignmentResult {
  fromRole: string;
  toRole: string;
  fullName: string;
  counts: RelationshipCounts;
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

  // Relationship cleanup and the role update are one Postgres transaction.
  // Preview uses the same planner/counting path without writing, while apply
  // recalculates under a profile-row lock so the returned impact is what was
  // actually changed.
  const { data, error } = await admin.rpc("reassign_profile_role", {
    p_user_id: userId,
    p_role: role,
    p_preview: preview,
  });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not reassign this person." }, { status: 500 });
  }

  const result = data as ReassignmentResult;
  const plan = planReassignment(result.fromRole, result.toRole);
  const impact = describeImpact(plan, result.counts);

  if (preview) {
    return NextResponse.json({
      fromRole: result.fromRole,
      toRole: result.toRole,
      fullName: result.fullName,
      impact,
    });
  }

  revalidateTag("admin-dashboard", "max");
  revalidateTag("dashboard", "max");

  return NextResponse.json({ success: true, impact });
}
