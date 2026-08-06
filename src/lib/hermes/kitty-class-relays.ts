export type KittyAttendanceStatus = "expected" | "absent" | "late" | "leaving_early";

export type KittyRelayIntent =
  | "student_absent"
  | "student_late"
  | "student_leaving_early"
  | "teacher_late"
  | "mode_changed"
  | "location_changed"
  | "meeting_link_requested"
  | "class_status_requested"
  | "substitute_teacher"
  | "preparation_note";

export type KittyRelayMode = "online" | "in_person";

export type KittyPreparationCategory =
  | "bring_materials"
  | "complete_assigned_work"
  | "review_prior_material"
  | "bring_device";

export type KittyOperationalRelayFields = {
  intent: KittyRelayIntent;
  estimatedAt?: string | null;
  mode?: KittyRelayMode | null;
  locationLabel?: string | null;
  preparationCategory?: KittyPreparationCategory | null;
};

type RecipientRoster = {
  teacher: { contactId: string; receivesNotifications: boolean; isActive: boolean } | null;
  enrollments: Array<{
    id: string;
    isActive: boolean;
    contacts: Array<{ contactId: string; receivesNotifications: boolean; isActive: boolean }>;
  }>;
};

const ATTENDANCE_STATUSES = new Set<KittyAttendanceStatus>(["expected", "absent", "late", "leaving_early"]);
const RELAY_INTENTS = new Set<KittyRelayIntent>([
  "student_absent", "student_late", "student_leaving_early", "teacher_late",
  "mode_changed", "location_changed", "meeting_link_requested", "class_status_requested",
  "substitute_teacher", "preparation_note",
]);
const STUDENT_RELAY_INTENTS = new Set<KittyRelayIntent>(["student_absent", "student_late", "student_leaving_early"]);
const FAMILY_REQUEST_INTENTS = new Set<KittyRelayIntent>(["meeting_link_requested", "class_status_requested"]);
const PREPARATION_CATEGORIES = new Set<KittyPreparationCategory>([
  "bring_materials", "complete_assigned_work", "review_prior_material", "bring_device",
]);
const PREPARATION_SUMMARIES: Record<KittyPreparationCategory, string> = {
  bring_materials: "Please bring the usual class materials.",
  complete_assigned_work: "Please complete the assigned work before class.",
  review_prior_material: "Please review the previous class material before class.",
  bring_device: "Please bring the device normally used for class.",
};
const SENSITIVE_CONTENT = /\b(?:diagnos(?:is|ed)|medical|medication|therapy|disab(?:ility|led)|grade|gpa|exam score|tuition|payment|invoice|debt|disciplin(?:e|ary)|suspension|expulsion|abuse|violence)\b/i;

function optionalBoundedText(value: unknown, field: string, limit: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit) throw new Error(`${field}_too_long`);
  if (SENSITIVE_CONTENT.test(normalized)) throw new Error("sensitive_relay_content");
  return normalized;
}

function optionalInstant(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) throw new Error("invalid_estimated_at");
  return new Date(value).toISOString();
}

export function normalizeKittyAttendance(input: { status: unknown; estimatedAt?: unknown; note?: unknown }) {
  if (typeof input.status !== "string" || !ATTENDANCE_STATUSES.has(input.status as KittyAttendanceStatus)) throw new Error("invalid_attendance_status");
  const status = input.status as KittyAttendanceStatus;
  const estimatedAt = optionalInstant(input.estimatedAt);
  if (estimatedAt && status !== "late" && status !== "leaving_early") throw new Error("attendance_estimate_not_permitted");
  return {
    status,
    estimatedAt,
    note: optionalBoundedText(input.note, "attendance_note", 240),
  };
}

export function normalizeKittyOperationalRelay(input: {
  intent: unknown;
  estimatedAt?: unknown;
  mode?: unknown;
  locationLabel?: unknown;
  preparationCategory?: unknown;
}): KittyOperationalRelayFields {
  if (typeof input.intent !== "string" || !RELAY_INTENTS.has(input.intent as KittyRelayIntent)) throw new Error("unsupported_relay_intent");
  const intent = input.intent as KittyRelayIntent;
  const estimatedAt = optionalInstant(input.estimatedAt);
  if (estimatedAt && !["student_late", "student_leaving_early", "teacher_late"].includes(intent)) throw new Error("relay_estimate_not_permitted");
  const mode = input.mode === undefined || input.mode === null || input.mode === "" ? null : input.mode;
  if (mode !== null && mode !== "online" && mode !== "in_person") throw new Error("invalid_relay_mode");
  if (intent === "mode_changed" && mode === null) throw new Error("relay_mode_required");
  if (intent !== "mode_changed" && mode !== null) throw new Error("relay_mode_not_permitted");
  const locationLabel = optionalBoundedText(input.locationLabel, "location_label", 120);
  if (intent === "location_changed" && !locationLabel) throw new Error("location_label_required");
  if (intent !== "location_changed" && locationLabel) throw new Error("location_label_not_permitted");
  const preparationCategory = input.preparationCategory === undefined || input.preparationCategory === null || input.preparationCategory === ""
    ? null
    : input.preparationCategory;
  if (preparationCategory !== null && (
    typeof preparationCategory !== "string"
    || !PREPARATION_CATEGORIES.has(preparationCategory as KittyPreparationCategory)
  )) throw new Error("invalid_preparation_category");
  if (intent === "preparation_note" && preparationCategory === null) throw new Error("preparation_category_required");
  if (intent !== "preparation_note" && preparationCategory !== null) throw new Error("preparation_category_not_permitted");
  return {
    intent,
    estimatedAt,
    mode: mode as KittyRelayMode | null,
    locationLabel,
    preparationCategory: preparationCategory as KittyPreparationCategory | null,
  };
}

export function selectKittyRelayRecipients(
  roster: RecipientRoster,
  relay: { intent: KittyRelayIntent; enrollmentId?: string | null },
) {
  const recipients: Array<{ contactId: string; audience: "teacher" | "family" }> = [];
  const seen = new Set<string>();
  const add = (contactId: string, audience: "teacher" | "family") => {
    if (!seen.has(contactId)) {
      recipients.push({ contactId, audience });
      seen.add(contactId);
    }
  };
  const teacher = roster.teacher;
  if (STUDENT_RELAY_INTENTS.has(relay.intent) || FAMILY_REQUEST_INTENTS.has(relay.intent)) {
    if (!relay.enrollmentId) throw new Error("relay_enrollment_required");
    const enrollment = roster.enrollments.find((item) => item.id === relay.enrollmentId && item.isActive);
    if (!enrollment) throw new Error("relay_enrollment_unavailable");
    if (teacher?.isActive && teacher.receivesNotifications) add(teacher.contactId, "teacher");
    if (STUDENT_RELAY_INTENTS.has(relay.intent)) {
      for (const contact of enrollment.contacts) {
        if (contact.isActive && contact.receivesNotifications) add(contact.contactId, "family");
      }
    }
    return recipients;
  }
  for (const enrollment of roster.enrollments) {
    if (!enrollment.isActive) continue;
    for (const contact of enrollment.contacts) {
      if (contact.isActive && contact.receivesNotifications) add(contact.contactId, "family");
    }
  }
  return recipients;
}

function displayEstimate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

export function buildKittyRelayTemplateData(
  relayInput: KittyOperationalRelayFields,
  audience: "teacher" | "family",
) {
  const relay = normalizeKittyOperationalRelay(relayInput);
  let relaySummary: string;
  switch (relay.intent) {
    case "student_absent": relaySummary = audience === "teacher" ? "A student will be absent." : "Your student will be absent."; break;
    case "student_late": relaySummary = relay.estimatedAt
      ? `${audience === "teacher" ? "A student" : "Your student"} expects to arrive at ${displayEstimate(relay.estimatedAt)}.`
      : `${audience === "teacher" ? "A student" : "Your student"} will arrive late.`; break;
    case "student_leaving_early": relaySummary = relay.estimatedAt
      ? `${audience === "teacher" ? "A student" : "Your student"} expects to leave at ${displayEstimate(relay.estimatedAt)}.`
      : `${audience === "teacher" ? "A student" : "Your student"} will leave early.`; break;
    case "teacher_late": relaySummary = relay.estimatedAt
      ? `The teacher expects to start at ${displayEstimate(relay.estimatedAt)}.`
      : "The teacher is running a few minutes late."; break;
    case "mode_changed": relaySummary = relay.mode === "online" ? "This class will be online." : "This class will be in person."; break;
    case "location_changed": relaySummary = `The class location is now ${relay.locationLabel}.`; break;
    case "meeting_link_requested": relaySummary = "A family has requested the configured meeting link."; break;
    case "class_status_requested": relaySummary = "A family has asked whether this class is still happening."; break;
    case "substitute_teacher": relaySummary = "A substitute teacher will lead this class."; break;
    case "preparation_note": relaySummary = PREPARATION_SUMMARIES[relay.preparationCategory!]; break;
  }
  return { relaySummary };
}

export function relayWhatsAppIntent(intent: KittyRelayIntent) {
  if (STUDENT_RELAY_INTENTS.has(intent)) return "class_attendance_update" as const;
  if (intent === "teacher_late") return "class_teacher_delay" as const;
  return "class_operational_update" as const;
}
