export type HermesCaseStatus = "draft" | "collecting_availability" | "proposing" | "awaiting_approval" | "confirmed" | "cancelled" | "needs_attention";

const TRANSITIONS: Record<HermesCaseStatus, readonly HermesCaseStatus[]> = {
  draft: ["collecting_availability", "cancelled", "needs_attention"],
  collecting_availability: ["proposing", "awaiting_approval", "cancelled", "needs_attention"],
  proposing: ["collecting_availability", "awaiting_approval", "cancelled", "needs_attention"],
  awaiting_approval: ["confirmed", "proposing", "cancelled", "needs_attention"],
  confirmed: ["cancelled", "needs_attention"],
  cancelled: [],
  needs_attention: ["collecting_availability", "proposing", "cancelled"],
};

export function canTransitionCase(from: string, to: string): boolean {
  return from in TRANSITIONS && TRANSITIONS[from as HermesCaseStatus].includes(to as HermesCaseStatus);
}

export interface CommunicationContact {
  consentStatus: string;
  communicationPolicy: string;
  isActive: boolean;
}

export function communicationDecision(contact: CommunicationContact): { allowed: true } | { allowed: false; reason: string } {
  if (!contact.isActive) return { allowed: false, reason: "inactive" };
  if (contact.consentStatus !== "attested" || contact.communicationPolicy === "opted_out") return { allowed: false, reason: "opted_out" };
  if (contact.communicationPolicy !== "direct") return { allowed: false, reason: contact.communicationPolicy };
  return { allowed: true };
}

interface ContactRecord {
  id: string;
  display_name: string;
  role: string;
  timezone: string | null;
  communication_policy: string;
  consent_status: string;
  is_active?: boolean;
}

export function projectContact(contact: ContactRecord) {
  return {
    id: contact.id,
    displayName: contact.display_name,
    role: contact.role,
    timezone: contact.timezone,
    communicationPolicy: contact.communication_policy,
    canMessage: communicationDecision({
      consentStatus: contact.consent_status,
      communicationPolicy: contact.communication_policy,
      isActive: contact.is_active !== false,
    }).allowed,
  };
}

export interface AvailabilityWindow {
  start: string;
  end: string;
  timezone?: string;
}

export function sanitizeAvailability(input: unknown): AvailabilityWindow[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error("invalid_availability");
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid_availability");
    const candidate = item as Record<string, unknown>;
    const start = typeof candidate.start === "string" ? new Date(candidate.start) : new Date(Number.NaN);
    const end = typeof candidate.end === "string" ? new Date(candidate.end) : new Date(Number.NaN);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("invalid_availability");
    const timezone = typeof candidate.timezone === "string" && candidate.timezone.length <= 100 ? candidate.timezone.trim() : undefined;
    return { start: start.toISOString(), end: end.toISOString(), ...(timezone ? { timezone } : {}) };
  });
}
