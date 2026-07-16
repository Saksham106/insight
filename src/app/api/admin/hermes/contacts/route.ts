import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { normalizePhone } from "@/lib/hermes/phone";
import type { HermesContactRole } from "@/lib/hermes/types";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set<HermesContactRole>(["teacher", "student", "parent", "employee", "other", "unclassified"]);

export async function GET() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from("hermes_contacts")
    .select("id, display_name, whatsapp_e164, role, profile_id, profile_link_status, communication_policy, consent_status, timezone, updated_at")
    .is("deleted_at", null)
    .order("display_name");
  if (error) return NextResponse.json({ error: "Could not load contacts." }, { status: 500 });
  return NextResponse.json({ contacts: data });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await request.json();
  const displayName = body.displayName?.toString().trim();
  const role = body.role?.toString() as HermesContactRole;
  const phone = normalizePhone(body.phone?.toString() ?? "", body.defaultCallingCode?.toString());
  if (!displayName || !ROLES.has(role) || role === "unclassified" || !phone.ok || body.consentAttested !== true) {
    return NextResponse.json({ error: "A valid name, phone, role, and consent confirmation are required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("hermes_contacts").insert({
    display_name: displayName,
    whatsapp_e164: phone.e164,
    role,
    communication_policy: "direct",
    consent_status: "attested",
    consent_source: "admin_attestation",
    consent_attested_by: profile.id,
  }).select("id, display_name, whatsapp_e164, role").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That WhatsApp number already exists." : "Could not create the contact." }, { status: error.code === "23505" ? 409 : 500 });
  await supabase.from("hermes_audit_events").insert({ actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_created", entity_type: "hermes_contact", entity_id: data.id });
  return NextResponse.json({ contact: data }, { status: 201 });
}
