import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  RELATIONSHIP_SOURCE_CHANNEL,
  RELATIONSHIP_TYPE,
  parseRelationshipMutation,
  relationshipErrorResponse,
} from "@/lib/hermes/relationships";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Parent/guardian-to-student links.
 *
 * Both handlers are administrator-only and run through the service-role client
 * on the server; the browser never sees that credential. Writes go through
 * public.upsert_academy_contact_relationship rather than touching the table, so
 * the role checks, the self-link refusal, and the active-contact requirement
 * stay in one place, and a repeated request is idempotent instead of an error.
 * Links are never deleted — removing one deactivates it and keeps the history.
 */

export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hermes_contact_relationships")
    .select("id, source_contact_id, target_contact_id, relationship_type, is_active")
    .eq("relationship_type", RELATIONSHIP_TYPE)
    .limit(1000);
  if (error) {
    return NextResponse.json({ error: "Could not load the links." }, { status: 500 });
  }
  return NextResponse.json({ relationships: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseRelationshipMutation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { parentContactId, studentContactId, active } = parsed.value;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("upsert_academy_contact_relationship", {
    p_source_contact_id: parentContactId,
    p_target_contact_id: studentContactId,
    p_relationship_type: RELATIONSHIP_TYPE,
    p_is_active: active,
    p_source_channel: RELATIONSHIP_SOURCE_CHANNEL,
  });
  if (error) {
    const response = relationshipErrorResponse(error.message);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }

  // The RPC writes its own audit event, but with no actor_profile_id. This
  // second event is what ties the change to the administrator who made it.
  const relationship = data as { id?: string } | null;
  await supabase.from("hermes_audit_events").insert({
    actor_type: "admin",
    actor_profile_id: profile.id,
    event_type: active ? "contact_relationship_linked" : "contact_relationship_unlinked",
    entity_type: "contact_relationship",
    entity_id: relationship?.id ?? null,
    metadata: {
      relationshipType: RELATIONSHIP_TYPE,
      sourceChannel: RELATIONSHIP_SOURCE_CHANNEL,
      parentContactId,
      studentContactId,
      active,
    },
  });

  return NextResponse.json({ relationship: data });
}
