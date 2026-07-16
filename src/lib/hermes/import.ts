import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { suggestProfileMatches, type MatchableProfile, type ProfileMatchSuggestion } from "./matching";
import { normalizePhone } from "./phone";
import type { ParsedVCardContact } from "./types";

export interface ExistingHermesContact {
  id: string;
  display_name: string;
  whatsapp_e164: string;
}

export interface ImportPreviewRow {
  sourceIndex: number;
  displayName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  existingContactId: string | null;
  suggestions: ProfileMatchSuggestion[];
  error: "name_required" | "phone_required" | "country_code_required" | "invalid_phone" | "duplicate_in_upload" | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: { total: number; ready: number; errors: number; existing: number; suggestedMatches: number };
}

export interface ImportPreviewTokenPayload {
  digest: string;
  expiresAt: number;
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

export function buildImportPreview(input: {
  parsed: ParsedVCardContact[];
  profiles: MatchableProfile[];
  existingContacts: ExistingHermesContact[];
  defaultCallingCode?: string;
}): ImportPreview {
  const seen = new Set<string>();
  const existingByPhone = new Map(input.existingContacts.map((contact) => [contact.whatsapp_e164, contact.id]));
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

      rows.push({
        sourceIndex: contact.sourceIndex,
        displayName: contact.displayName,
        rawPhone,
        normalizedPhone,
        existingContactId: normalizedPhone ? existingByPhone.get(normalizedPhone) ?? null : null,
        suggestions: error ? [] : suggestProfileMatches(contact.displayName, input.profiles),
        error,
      });
    });
  }

  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter((row) => !row.error).length,
      errors: rows.filter((row) => row.error).length,
      existing: rows.filter((row) => !row.error && row.existingContactId).length,
      suggestedMatches: rows.filter((row) => !row.error && row.suggestions.length > 0).length,
    },
  };
}
