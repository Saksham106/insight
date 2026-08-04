import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import {
  digestImportRows,
  validateImportChanges,
  validateImportSelection,
  verifyImportPreview,
  type ImportContactChange,
} from "@/lib/hermes/import";
import type { HermesContactRole } from "@/lib/hermes/types";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set<HermesContactRole>(["teacher", "student", "parent", "employee", "other", "unclassified"]);

interface CommitContact {
  displayName: string;
  normalizedPhone: string;
  role: HermesContactRole;
  profileId?: string | null;
}

function assignableRole(role: unknown): role is Exclude<HermesContactRole, "unclassified"> {
  return typeof role === "string" && ROLES.has(role as HermesContactRole) && role !== "unclassified";
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const secret = process.env.HERMES_IMPORT_SIGNING_SECRET ?? process.env.HERMES_TOOL_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Contact import is not configured." }, { status: 503 });
  const body = await request.json();
  const token = verifyImportPreview(body.previewToken?.toString() ?? "", secret);
  const previewRows = Array.isArray(body.previewRows) ? body.previewRows : [];
  if (!token || token.digest !== digestImportRows(previewRows)) {
    return NextResponse.json({ error: "The preview expired or changed. Upload the contact file again." }, { status: 400 });
  }

  const contacts = (Array.isArray(body.contacts) ? body.contacts : []) as CommitContact[];
  const updates = (Array.isArray(body.updates) ? body.updates : []) as ImportContactChange[];
  const restores = (Array.isArray(body.restores) ? body.restores : []) as ImportContactChange[];

  if (contacts.length === 0 && updates.length === 0 && restores.length === 0) {
    return NextResponse.json({ error: "Select at least one contact to import, update, or restore." }, { status: 400 });
  }
  // Consent covers contacts being created. Contacts already in the directory
  // were attested in an earlier batch and are not re-attested here.
  if (contacts.length > 0 && body.consentAttested !== true) {
    return NextResponse.json({ error: "Confirm consent before importing contacts." }, { status: 400 });
  }
  if (contacts.some((contact) => !contact.displayName?.trim() || !/^\+[1-9]\d{7,14}$/.test(contact.normalizedPhone) || !assignableRole(contact.role))) {
    return NextResponse.json({ error: "Every selected contact needs a valid name, number, and role." }, { status: 400 });
  }
  if (contacts.length > 0 && !validateImportSelection(previewRows, contacts)) {
    return NextResponse.json({ error: "The selected contacts do not match the signed preview. Upload the contact file again." }, { status: 400 });
  }
  if (updates.some((update) => !assignableRole(update.role)) || restores.some((restore) => restore.role !== null && !assignableRole(restore.role))) {
    return NextResponse.json({ error: "Choose a valid role for every changed contact." }, { status: 400 });
  }
  if (!validateImportChanges(previewRows, updates, "existing") || !validateImportChanges(previewRows, restores, "removed")) {
    return NextResponse.json({ error: "The changed contacts do not match the signed preview. Upload the contact file again." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let created = 0;
  let skipped = 0;

  if (contacts.length > 0) {
    const { data, error } = await supabase.rpc("import_hermes_contacts", {
      p_imported_by: profile.id,
      p_source_sha256: token.digest,
      p_contacts: contacts,
    });
    if (error) return NextResponse.json({ error: "The contacts were not imported." }, { status: 500 });
    created = Number((data as { created?: number })?.created ?? 0);
    skipped = Number((data as { skipped?: number })?.skipped ?? 0);
  }

  let updated = 0;
  let firstFailure: string | null = null;
  for (const update of updates) {
    const { data, error } = await supabase
      .from("hermes_contacts")
      .update({ role: update.role })
      .eq("id", update.contactId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      firstFailure ??= "One or more contact updates failed.";
      continue;
    }
    if (!data) continue;
    updated += 1;
    await supabase.from("hermes_audit_events").insert({
      actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_updated",
      entity_type: "hermes_contact", entity_id: update.contactId, metadata: { fields: ["role"], source: "import" },
    });
  }

  let restored = 0;
  const restoredMuted: { contactId: string; displayName: string; communicationPolicy: string }[] = [];
  for (const restore of restores) {
    const patch: Record<string, unknown> = { deleted_at: null, is_active: true };
    if (restore.role) patch.role = restore.role;
    const { data, error } = await supabase
      .from("hermes_contacts")
      .update(patch)
      .eq("id", restore.contactId)
      .select("id, display_name, communication_policy, consent_status")
      .maybeSingle();
    if (error) {
      firstFailure ??= "One or more contact restores failed.";
      continue;
    }
    if (!data) continue;
    restored += 1;
    // A contact restored to the directory may still be opted out from an earlier
    // WhatsApp "STOP" received while removed; surface that so the admin knows.
    if (data.communication_policy !== "direct") {
      restoredMuted.push({ contactId: data.id, displayName: data.display_name, communicationPolicy: data.communication_policy });
    }
    const fields = restore.role ? ["deleted_at", "is_active", "role"] : ["deleted_at", "is_active"];
    await supabase.from("hermes_audit_events").insert({
      actor_type: "admin", actor_profile_id: profile.id, event_type: "contact_restored",
      entity_type: "hermes_contact", entity_id: restore.contactId,
      metadata: { fields, source: "import", communication_policy: data.communication_policy, consent_status: data.consent_status },
    });
  }

  const result = { created, skipped, updated, restored };
  if (firstFailure) return NextResponse.json({ error: firstFailure, result, restoredMuted }, { status: 500 });
  return NextResponse.json({ result, restoredMuted });
}
