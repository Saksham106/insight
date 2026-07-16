import type { PhoneNormalizationResult } from "./types";

const E164 = /^\+[1-9]\d{7,14}$/;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(raw: string, defaultCallingCode?: string): PhoneNormalizationResult {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "invalid_phone" };
  if (digitsOnly(value).length < 8) return { ok: false, reason: "invalid_phone" };

  let candidate: string;
  if (value.startsWith("+")) {
    candidate = `+${digitsOnly(value)}`;
  } else if (value.startsWith("00")) {
    candidate = `+${digitsOnly(value).slice(2)}`;
  } else {
    const callingCode = digitsOnly(defaultCallingCode ?? "").replace(/^0+/, "");
    if (!callingCode) return { ok: false, reason: "country_code_required" };
    const local = digitsOnly(value).replace(/^0+/, "");
    candidate = `+${callingCode}${local}`;
  }

  if (!E164.test(candidate)) return { ok: false, reason: "invalid_phone" };
  return { ok: true, e164: candidate };
}
