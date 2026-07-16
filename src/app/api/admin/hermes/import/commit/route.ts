import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { digestImportRows, verifyImportPreview } from "@/lib/hermes/import";
import type { HermesContactRole } from "@/lib/hermes/types";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set<HermesContactRole>(["teacher", "student", "parent", "employee", "other", "unclassified"]);

interface CommitContact {
  displayName: string;
  normalizedPhone: string;
  role: HermesContactRole;
  profileId?: string | null;
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
  if (body.consentAttested !== true) {
    return NextResponse.json({ error: "Confirm consent before importing contacts." }, { status: 400 });
  }

  const contacts = (Array.isArray(body.contacts) ? body.contacts : []) as CommitContact[];
  if (contacts.length === 0) return NextResponse.json({ error: "Select at least one valid contact." }, { status: 400 });
  if (contacts.some((contact) => !contact.displayName?.trim() || !/^\+[1-9]\d{7,14}$/.test(contact.normalizedPhone) || !ROLES.has(contact.role) || contact.role === "unclassified")) {
    return NextResponse.json({ error: "Every selected contact needs a valid name, number, and role." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("import_hermes_contacts", {
    p_imported_by: profile.id,
    p_source_sha256: token.digest,
    p_contacts: contacts,
  });
  if (error) return NextResponse.json({ error: "The contacts were not imported." }, { status: 500 });
  return NextResponse.json({ result: data });
}
