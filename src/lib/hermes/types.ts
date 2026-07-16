export type HermesContactRole = "teacher" | "student" | "parent" | "employee" | "other" | "unclassified";

export type CommunicationPolicy = "direct" | "guardian_only" | "approval_required" | "paused" | "opted_out";

export type PhoneNormalizationResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "country_code_required" | "invalid_phone" };

export interface ParsedVCardContact {
  sourceIndex: number;
  displayName: string;
  phones: string[];
  error?: "name_required" | "phone_required";
}
