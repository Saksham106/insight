import { NextResponse } from "next/server";

import { getUserProfile } from "@/lib/auth/get-user-profile";
import { buildImportPreview, digestImportRows, signImportPreview } from "@/lib/hermes/import";
import { parseVCardContacts } from "@/lib/hermes/vcard";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_VCARD_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const secret = process.env.HERMES_IMPORT_SIGNING_SECRET ?? process.env.HERMES_TOOL_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Contact import is not configured." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  const defaultCallingCode = form.get("defaultCallingCode")?.toString().trim() || undefined;
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".vcf")) {
    return NextResponse.json({ error: "Upload an iPhone vCard (.vcf) file." }, { status: 400 });
  }
  if (file.size > MAX_VCARD_BYTES) return NextResponse.json({ error: "The vCard must be smaller than 2 MB." }, { status: 413 });

  const parsed = parseVCardContacts(await file.text());
  const supabase = createAdminClient();
  const [profilesResult, contactsResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, timezone").eq("is_active", true).is("deleted_at", null),
    supabase.from("hermes_contacts").select("id, display_name, whatsapp_e164").is("deleted_at", null),
  ]);
  if (profilesResult.error || contactsResult.error) {
    return NextResponse.json({ error: "Could not prepare the contact preview." }, { status: 500 });
  }

  const preview = buildImportPreview({
    parsed,
    profiles: profilesResult.data ?? [],
    existingContacts: contactsResult.data ?? [],
    defaultCallingCode,
  });
  const previewToken = signImportPreview(
    { digest: digestImportRows(preview.rows), expiresAt: Date.now() + 15 * 60 * 1000 },
    secret,
  );
  return NextResponse.json({ ...preview, previewToken });
}
