import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import type { CommunicationPolicy, HermesContactRole } from "@/lib/hermes/types";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set<HermesContactRole>(["teacher", "student", "parent", "employee", "other", "unclassified"]);
const POLICIES = new Set<CommunicationPolicy>(["direct", "guardian_only", "approval_required", "paused", "opted_out"]);

export async function PATCH(request: Request, context: RouteContext<"/api/admin/hermes/contacts/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (typeof body.displayName === "string") {
    const name = body.displayName.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    update.display_name = name;
  }
  if (body.role !== undefined) {
    if (!ROLES.has(body.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    update.role = body.role;
  }
  if (body.communicationPolicy !== undefined) {
    if (!POLICIES.has(body.communicationPolicy)) return NextResponse.json({ error: "Invalid communication policy." }, { status: 400 });
    update.communication_policy = body.communicationPolicy;
    if (body.communicationPolicy === "opted_out") update.consent_status = "withdrawn";
  }
  if (body.profileId !== undefined) {
    if (body.profileId === null) {
      Object.assign(update, { profile_id: null, profile_link_status: "unlinked", profile_link_confirmed_by: null, profile_link_confirmed_at: null });
    } else {
      const supabase = createAdminClient();
      const { data: target } = await supabase.from("profiles").select("id, role, timezone").eq("id", body.profileId).eq("is_active", true).is("deleted_at", null).maybeSingle();
      if (!target) return NextResponse.json({ error: "That Insight profile is unavailable." }, { status: 400 });
      const { data: used } = await supabase.from("hermes_contacts").select("id").eq("profile_id", body.profileId).neq("id", id).is("deleted_at", null).maybeSingle();
      if (used) return NextResponse.json({ error: "That Insight profile is already linked to another contact." }, { status: 409 });
      Object.assign(update, { profile_id: target.id, profile_link_status: "confirmed", profile_link_confirmed_by: profile.id, profile_link_confirmed_at: new Date().toISOString(), role: target.role, timezone: target.timezone, timezone_source: target.timezone ? "profile" : null });
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No supported changes were supplied." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("hermes_contacts").update(update).eq("id", id).is("deleted_at", null).select("id, display_name, role, profile_id, communication_policy").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not update the contact." }, { status: 500 });
  await supabase.from("hermes_audit_events").insert({ actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_updated", entity_type: "hermes_contact", entity_id: id, metadata: { fields: Object.keys(update) } });
  return NextResponse.json({ contact: data });
}
