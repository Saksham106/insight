import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { suggestProfileMatches, type MatchableProfile, type ProfileMatchSuggestion } from "./matching";
import { normalizePhone } from "./phone";
import type { ParsedVCardContact } from "./types";

export interface ExistingHermesContact {
  id: string;
  display_name: string;
  whatsapp_e164: string;
  role: string;
  deleted_at: string | null;
}

/** Which bucket the review screen files this row under. */
export type ImportRowStatus = "new" | "existing" | "removed" | "error";

export interface ImportPreviewRow {
  sourceIndex: number;
  displayName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  status: ImportRowStatus;
  /** The directory contact this row already matches, if any. */
  existing: { id: string; displayName: string; role: string; deleted: boolean } | null;
  suggestions: ProfileMatchSuggestion[];
  error: "name_required" | "phone_required" | "country_code_required" | "invalid_phone" | "duplicate_in_upload" | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: { total: number; new: number; existing: number; removed: number; errors: number };
}

export interface ImportPreviewTokenPayload {
  digest: string;
  expiresAt: number;
}

export interface ImportSelection {
  displayName: string;
  normalizedPhone: string;
  role: string;
  profileId?: string | null;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function digestImportRows(rows: unknown) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function signImportPreview(payload: ImportPreviewTokenPayload, secret: string) {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyImportPreview(token: string, secret: string, now = Date.now()): ImportPreviewTokenPayload | null {
  try {
    const [body, supplied, extra] = token.split(".");
    if (!body || !supplied || extra) return null;
    const expected = createHmac("sha256", secret).update(body).digest();
    const actual = Buffer.from(supplied, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(decode(body)) as ImportPreviewTokenPayload;
    if (typeof payload.digest !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function validateImportSelection(rows: ImportPreviewRow[], contacts: ImportSelection[]) {
  const creatableByPhone = new Map(
    rows
      .filter((row) => row.status === "new" && row.normalizedPhone)
      .map((row) => [row.normalizedPhone!, row]),
  );
  if (contacts.length === 0 || new Set(contacts.map((contact) => contact.normalizedPhone)).size !== contacts.length) return false;

  return contacts.every((contact) => {
    const row = creatableByPhone.get(contact.normalizedPhone);
    if (!row || row.displayName !== contact.displayName) return false;
    if (!contact.profileId) return true;
    return row.suggestions.some((suggestion) => suggestion.profileId === contact.profileId && suggestion.role === contact.role);
  });
}

export function buildImportPreview(input: {
  parsed: ParsedVCardContact[];
  profiles: MatchableProfile[];
  existingContacts: ExistingHermesContact[];
  defaultCallingCode?: string;
}): ImportPreview {
  const seen = new Set<string>();
  const existingByPhone = new Map(input.existingContacts.map((contact) => [contact.whatsapp_e164, contact]));
  const rows: ImportPreviewRow[] = [];

  for (const contact of input.parsed) {
    const rawPhones = contact.phones.length > 0 ? contact.phones : [""];
    rawPhones.forEach((rawPhone, phoneIndex) => {
      const parsedError = phoneIndex === 0 ? contact.error ?? null : null;
      const normalized = rawPhone ? normalizePhone(rawPhone, input.defaultCallingCode) : null;
      let error: ImportPreviewRow["error"] = parsedError;
      let normalizedPhone: string | null = null;

      if (!error && normalized) {
        if (!normalized.ok) error = normalized.reason;
        else {
          normalizedPhone = normalized.e164;
          if (seen.has(normalizedPhone)) error = "duplicate_in_upload";
          else seen.add(normalizedPhone);
        }
      }

      const match = normalizedPhone ? existingByPhone.get(normalizedPhone) ?? null : null;
      const existing = match
        ? { id: match.id, displayName: match.display_name, role: match.role, deleted: match.deleted_at !== null }
        : null;
      const status: ImportRowStatus = error
        ? "error"
        : existing
          ? existing.deleted
            ? "removed"
            : "existing"
          : "new";

      rows.push({
        sourceIndex: contact.sourceIndex,
        displayName: contact.displayName,
        rawPhone,
        normalizedPhone,
        status,
        existing,
        // Only a contact being created needs an Insight profile suggestion.
        suggestions: status === "new" ? suggestProfileMatches(contact.displayName, input.profiles) : [],
        error,
      });
    });
  }

  return {
    rows,
    summary: {
      total: rows.length,
      new: rows.filter((row) => row.status === "new").length,
      existing: rows.filter((row) => row.status === "existing").length,
      removed: rows.filter((row) => row.status === "removed").length,
      errors: rows.filter((row) => row.status === "error").length,
    },
  };
}
