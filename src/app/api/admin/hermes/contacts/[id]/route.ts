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
  let expectedCommunicationPolicy: CommunicationPolicy | null = null;

  let restoring = false;
  if (body.restore === true) {
    restoring = true;
    Object.assign(update, { deleted_at: null, is_active: true });
  }

  if (typeof body.displayName === "string") {
    const name = body.displayName.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    update.display_name = name;
  }
  if (body.preferredName !== undefined) {
    if (body.preferredName === null) {
      update.preferred_name = null;
    } else if (typeof body.preferredName === "string") {
      const preferred = body.preferredName.trim();
      if (!preferred || preferred.length > 100) {
        return NextResponse.json({ error: "Messaging name must be 1-100 characters." }, { status: 400 });
      }
      update.preferred_name = preferred;
    } else {
      return NextResponse.json({ error: "Invalid messaging name." }, { status: 400 });
    }
  }
  if (body.role !== undefined) {
    if (!ROLES.has(body.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    update.role = body.role;
  }
  if (body.communicationPolicy !== undefined) {
    if (!POLICIES.has(body.communicationPolicy)) return NextResponse.json({ error: "Invalid communication policy." }, { status: 400 });
    if (body.expectedCommunicationPolicy === undefined || !POLICIES.has(body.expectedCommunicationPolicy)) {
      return NextResponse.json({ error: "The current communication policy is required." }, { status: 400 });
    }
    expectedCommunicationPolicy = body.expectedCommunicationPolicy;
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
  let query = supabase.from("hermes_contacts").update(update).eq("id", id);
  // Every field except restore refuses to edit a contact that was removed.
  if (!restoring) query = query.is("deleted_at", null);
  if (body.expectedCommunicationPolicy !== undefined) {
    query = query.eq("communication_policy", expectedCommunicationPolicy);
  }
  const { data, error } = await query
    .select("id, display_name, preferred_name, role, profile_id, communication_policy, consent_status")
    .maybeSingle();
  if (error) {
    // Restoring a contact whose profile_id is still set can collide with the
    // partial unique index (profile_id where deleted_at is null) if a later
    // import linked that same Insight profile to a different contact while
    // this one was removed. Name the fix instead of a bare 500.
    if (restoring && error.code === "23505") {
      return NextResponse.json(
        { error: "This contact's linked Insight profile is now linked to another contact. Unlink that contact first, then restore this one." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not update the contact." }, { status: 500 });
  }
  if (!data && body.expectedCommunicationPolicy !== undefined) {
    return NextResponse.json(
      { error: "This contact changed since you opened the page. Refresh and try again." },
      { status: 409 },
    );
  }
  if (!data) return NextResponse.json({ error: "Could not update the contact." }, { status: 500 });
  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: restoring ? "contact_restored" : "contact_updated",
    entity_type: "hermes_contact",
    entity_id: id,
    metadata: restoring
      ? { fields: Object.keys(update), communication_policy: data.communication_policy, consent_status: data.consent_status }
      : { fields: Object.keys(update) },
  });
  return NextResponse.json({ contact: data });
}

/**
 * Removes a contact from the directory and from Kitty's reach. Soft only:
 * transcripts, audit events, and case participation reference this row.
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/admin/hermes/contacts/[id]">) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hermes_contacts")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not remove the contact." }, { status: 500 });

  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: "contact_deleted",
    entity_type: "hermes_contact",
    entity_id: id,
  });
  return NextResponse.json({ contact: data });
}
