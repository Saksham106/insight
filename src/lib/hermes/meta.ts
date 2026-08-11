import type { CommunicationPolicy } from "./types";
import { validateClassDescription } from "./class-reminders";

export type WhatsAppIntent =
  | "permission_request"
  | "availability_request"
  | "time_proposal"
  | "class_confirmation"
  | "reschedule_request"
  | "class_reminder"
  | "lesson_report_request"
  | "tutor_report_request"
  | "family_invoice"
  | "payment_reminder"
  | "payment_received"
  | "human_attention"
  | "admin_reschedule_alert"
  | "class_change_request"
  | "class_change_proposal"
  | "class_cancelled"
  | "class_rescheduled"
  | "class_change_rejected"
  | "class_attendance_update"
  | "class_teacher_delay"
  | "class_operational_update";

export type SchedulingWhatsAppIntent = Exclude<WhatsAppIntent, "lesson_report_request" | "tutor_report_request" | "family_invoice" | "payment_reminder" | "payment_received">;

export interface TemplateConfig {
  name: string;
  locale: string;
  parameterStyle?: "human_attention";
}

export type TemplateMap = Partial<Record<WhatsAppIntent, TemplateConfig>>;

export type WhatsAppDelivery =
  | { kind: "free_form" }
  | { kind: "template"; name: string; locale: string; parameterStyle?: "human_attention" }
  | { kind: "blocked"; reason: "paused" | "guardian_only" | "approval_required" | "opted_out" | "template_unavailable" };

const SCHEDULING_PARAMETER_COUNTS: Record<SchedulingWhatsAppIntent, number> = {
  permission_request: 0,
  availability_request: 2,
  time_proposal: 3,
  class_confirmation: 3,
  reschedule_request: 2,
  class_reminder: 3,
  human_attention: 2,
  admin_reschedule_alert: 3,
  class_change_request: 4,
  class_change_proposal: 5,
  class_cancelled: 4,
  class_rescheduled: 5,
  class_change_rejected: 4,
  class_attendance_update: 3,
  class_teacher_delay: 3,
  class_operational_update: 3,
};

function requiredTemplateField(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`invalid_${key}`);
  return value.trim();
}

export function buildHumanAttentionFallbackContent(recipientNameInput: unknown, bodyInput: unknown) {
  const recipientName = requiredTemplateField({ recipientName: recipientNameInput }, "recipientName");
  if (typeof bodyInput !== "string") throw new Error("invalid_matter");
  const prefix = `Hi ${recipientName}, `;
  const matter = (bodyInput.startsWith(prefix) ? bodyInput.slice(prefix.length) : bodyInput)
    .trim()
    .replace(/[.!?]$/, "");
  if (!matter || matter.length > 500) throw new Error("invalid_matter");
  return { bodyParameters: [recipientName, matter] };
}

export function buildLessonReportRequestContent(periodStart: unknown, recipientName: unknown): { body: string; bodyParameters: string[] } {
  if (typeof periodStart !== "string" || !/^\d{4}-\d{2}-01$/.test(periodStart)) throw new Error("invalid_lesson_month");
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== periodStart) throw new Error("invalid_lesson_month");
  const tutorName = requiredTemplateField({ recipientName }, "recipientName");
  const period = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  const matter = `details of all classes you taught in ${period} so invoices can be prepared for the respective students or parents`;
  return {
    body: `Hello ${tutorName}, Swati from MyInsightAcademy needs your input about ${matter}. Please reply here when convenient.`,
    bodyParameters: [tutorName, matter],
  };
}

export function buildSchedulingMessageContent(input: {
  intent: WhatsAppIntent;
  recipientName: string;
  templateData: Record<string, unknown>;
}) {
  if (!(input.intent in SCHEDULING_PARAMETER_COUNTS)) throw new Error("unsupported_scheduling_intent");
  const intent = input.intent as SchedulingWhatsAppIntent;
  const recipientName = requiredTemplateField({ recipientName: input.recipientName }, "recipientName");
  const data = input.templateData;
  switch (intent) {
    case "permission_request":
      return { body: "Welcome to MyInsightAcademy on WhatsApp. Reply STOP at any time to opt out.", bodyParameters: [] };
    case "availability_request": {
      const classDescription = requiredTemplateField(data, "classDescription");
      return { body: `Hi ${recipientName}, what times work for your ${classDescription}?`, bodyParameters: [recipientName, classDescription] };
    }
    case "time_proposal": {
      const proposedDateTime = requiredTemplateField(data, "proposedDateTime");
      const classDescription = requiredTemplateField(data, "classDescription");
      return { body: `Hi ${recipientName}, does ${proposedDateTime} work for your ${classDescription}?`, bodyParameters: [recipientName, proposedDateTime, classDescription] };
    }
    case "class_confirmation": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const confirmedDateTime = requiredTemplateField(data, "confirmedDateTime");
      return { body: `Hi ${recipientName}, your ${classDescription} is confirmed for ${confirmedDateTime}.`, bodyParameters: [recipientName, classDescription, confirmedDateTime] };
    }
    case "reschedule_request": {
      const classDescription = requiredTemplateField(data, "classDescription");
      return { body: `Hi ${recipientName}, we need to reschedule your ${classDescription}. What times work?`, bodyParameters: [recipientName, classDescription] };
    }
    case "class_reminder": {
      const classDescription = validateClassDescription(requiredTemplateField(data, "classDescription"));
      const scheduledDateTime = requiredTemplateField(data, "scheduledDateTime");
      return { body: `Hi ${recipientName}! Just a reminder that your ${classDescription} is ${scheduledDateTime}.`, bodyParameters: [recipientName, classDescription, scheduledDateTime] };
    }
    case "human_attention": {
      const matter = requiredTemplateField(data, "matter");
      return { body: `Hi ${recipientName}, Swati needs your input about ${matter}.`, bodyParameters: [recipientName, matter] };
    }
    case "admin_reschedule_alert": {
      const requesterName = requiredTemplateField(data, "requesterName");
      const caseSummary = requiredTemplateField(data, "caseSummary");
      return { body: `Hi ${recipientName}, scheduling update for ${requesterName}: ${caseSummary}. Reply to coordinate this existing class.`, bodyParameters: [recipientName, requesterName, caseSummary] };
    }
    case "class_change_request": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const originalDateTime = requiredTemplateField(data, "originalDateTime");
      const referenceCode = requiredTemplateField(data, "referenceCode");
      return { body: `Hi ${recipientName}, a change was requested for ${classDescription} at ${originalDateTime}. Reply approve or reject. Reference ${referenceCode}.`, bodyParameters: [recipientName, classDescription, originalDateTime, referenceCode] };
    }
    case "class_change_proposal": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const originalDateTime = requiredTemplateField(data, "originalDateTime");
      const replacementDateTime = requiredTemplateField(data, "replacementDateTime");
      const referenceCode = requiredTemplateField(data, "referenceCode");
      return { body: `Hi ${recipientName}, can ${classDescription} move from ${originalDateTime} to ${replacementDateTime}? Reply approve or reject. Reference ${referenceCode}.`, bodyParameters: [recipientName, classDescription, originalDateTime, replacementDateTime, referenceCode] };
    }
    case "class_cancelled": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const originalDateTime = requiredTemplateField(data, "originalDateTime");
      const referenceCode = requiredTemplateField(data, "referenceCode");
      return { body: `Hi ${recipientName}, ${classDescription} at ${originalDateTime} has been cancelled. Reference ${referenceCode}.`, bodyParameters: [recipientName, classDescription, originalDateTime, referenceCode] };
    }
    case "class_rescheduled": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const originalDateTime = requiredTemplateField(data, "originalDateTime");
      const replacementDateTime = requiredTemplateField(data, "replacementDateTime");
      const referenceCode = requiredTemplateField(data, "referenceCode");
      return { body: `Hi ${recipientName}, ${classDescription} has moved from ${originalDateTime} to ${replacementDateTime}. Reference ${referenceCode}.`, bodyParameters: [recipientName, classDescription, originalDateTime, replacementDateTime, referenceCode] };
    }
    case "class_change_rejected": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const originalDateTime = requiredTemplateField(data, "originalDateTime");
      const referenceCode = requiredTemplateField(data, "referenceCode");
      return { body: `Hi ${recipientName}, the requested change to ${classDescription} at ${originalDateTime} was not agreed. The original class remains. Reference ${referenceCode}.`, bodyParameters: [recipientName, classDescription, originalDateTime, referenceCode] };
    }
    case "class_attendance_update":
    case "class_teacher_delay":
    case "class_operational_update": {
      const classDescription = requiredTemplateField(data, "classDescription");
      const relaySummary = requiredTemplateField(data, "relaySummary");
      return { body: `Hi ${recipientName}, update for ${classDescription}: ${relaySummary}`, bodyParameters: [recipientName, classDescription, relaySummary] };
    }
  }
}

export function validateSchedulingBodyParameters(intent: WhatsAppIntent, recipientName: string, parameters: unknown) {
  if (!(intent in SCHEDULING_PARAMETER_COUNTS) || !Array.isArray(parameters)) throw new Error("invalid_bodyParameters");
  const count = SCHEDULING_PARAMETER_COUNTS[intent as SchedulingWhatsAppIntent];
  if (parameters.length !== count || parameters.some((value) => typeof value !== "string" || !value.trim() || value.length > 500)) throw new Error("invalid_bodyParameters");
  if (count === 0) return [];
  return [requiredTemplateField({ recipientName }, "recipientName"), ...parameters.slice(1).map((value) => (value as string).trim())];
}

export function selectWhatsAppDelivery(
  contact: { communicationPolicy: CommunicationPolicy; consentStatus: string; serviceWindowExpiresAt: string | null },
  intent: WhatsAppIntent,
  now: Date,
  templates: TemplateMap,
  approved = false,
): WhatsAppDelivery {
  if (contact.consentStatus !== "attested" || contact.communicationPolicy === "opted_out") return { kind: "blocked", reason: "opted_out" };
  if (contact.communicationPolicy === "paused") return { kind: "blocked", reason: "paused" };
  if (contact.communicationPolicy === "guardian_only") return { kind: "blocked", reason: "guardian_only" };
  if (contact.communicationPolicy === "approval_required" && !approved) return { kind: "blocked", reason: "approval_required" };
  if (contact.serviceWindowExpiresAt && new Date(contact.serviceWindowExpiresAt).getTime() > now.getTime()) return { kind: "free_form" };
  const template = templates[intent];
  return template ? { kind: "template", ...template } : { kind: "blocked", reason: "template_unavailable" };
}

export function buildGraphMessageRequest(input: {
  to: string;
  delivery: Exclude<WhatsAppDelivery, { kind: "blocked" }>;
  body?: string;
  bodyParameters?: string[];
}) {
  const to = input.to.replace(/\D/g, "");
  if (input.delivery.kind === "free_form") {
    return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: input.body ?? "" } };
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: input.delivery.name,
      language: { code: input.delivery.locale },
      components: [{ type: "body", parameters: (input.bodyParameters ?? []).map((text) => ({ type: "text", text })) }],
    },
  };
}

export function classifyMetaFailure(httpStatus: number, graphCode?: number) {
  if (httpStatus === 429 || httpStatus >= 500 || graphCode === 1 || graphCode === 2 || graphCode === 4 || graphCode === 17 || graphCode === 32 || graphCode === 613) return "retryable" as const;
  return "permanent" as const;
}

export function templateMapFromEnv(env: NodeJS.ProcessEnv): TemplateMap {
  const locale = env.WHATSAPP_TEMPLATE_LOCALE ?? "en_US";
  const entries: Array<[WhatsAppIntent, string | undefined]> = [
    ["permission_request", env.WHATSAPP_TEMPLATE_PERMISSION_REQUEST],
    ["availability_request", env.WHATSAPP_TEMPLATE_AVAILABILITY_REQUEST],
    ["time_proposal", env.WHATSAPP_TEMPLATE_TIME_PROPOSAL],
    ["class_confirmation", env.WHATSAPP_TEMPLATE_CLASS_CONFIRMATION],
    ["reschedule_request", env.WHATSAPP_TEMPLATE_RESCHEDULE_REQUEST],
    ["class_reminder", env.WHATSAPP_TEMPLATE_CLASS_REMINDER],
    ["lesson_report_request", env.WHATSAPP_TEMPLATE_LESSON_REPORT_REQUEST],
    ["tutor_report_request", env.WHATSAPP_TEMPLATE_TUTOR_REPORT_REQUEST],
    ["family_invoice", env.WHATSAPP_TEMPLATE_FAMILY_INVOICE],
    ["payment_reminder", env.WHATSAPP_TEMPLATE_PAYMENT_REMINDER],
    ["payment_received", env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED],
    ["human_attention", env.WHATSAPP_TEMPLATE_HUMAN_ATTENTION],
    ["admin_reschedule_alert", env.WHATSAPP_TEMPLATE_ADMIN_RESCHEDULE_ALERT],
    ["class_change_request", env.WHATSAPP_TEMPLATE_CLASS_CHANGE_REQUEST],
    ["class_change_proposal", env.WHATSAPP_TEMPLATE_CLASS_CHANGE_PROPOSAL],
    ["class_cancelled", env.WHATSAPP_TEMPLATE_CLASS_CANCELLED],
    ["class_rescheduled", env.WHATSAPP_TEMPLATE_CLASS_RESCHEDULED],
    ["class_change_rejected", env.WHATSAPP_TEMPLATE_CLASS_CHANGE_REJECTED],
    ["class_attendance_update", env.WHATSAPP_TEMPLATE_CLASS_ATTENDANCE_UPDATE],
    ["class_teacher_delay", env.WHATSAPP_TEMPLATE_CLASS_TEACHER_DELAY],
    ["class_operational_update", env.WHATSAPP_TEMPLATE_CLASS_OPERATIONAL_UPDATE],
  ];
  const templates = Object.fromEntries(
    entries
      .filter((entry): entry is [WhatsAppIntent, string] => Boolean(entry[1]))
      .map(([intent, name]) => [intent, { name, locale }]),
  ) as TemplateMap;
  const humanAttention = env.WHATSAPP_TEMPLATE_HUMAN_ATTENTION;
  if (humanAttention) {
    for (const intent of [
      "class_change_request", "class_change_proposal", "class_cancelled", "class_rescheduled",
      "class_change_rejected", "class_attendance_update", "class_teacher_delay", "class_operational_update",
    ] as const) {
      templates[intent] ??= { name: humanAttention, locale, parameterStyle: "human_attention" };
    }
  }
  return templates;
}
