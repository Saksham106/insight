import type { CommunicationPolicy } from "./types";

export type WhatsAppIntent =
  | "permission_request"
  | "availability_request"
  | "time_proposal"
  | "class_confirmation"
  | "reschedule_request"
  | "class_reminder"
  | "human_attention";

export interface TemplateConfig {
  name: string;
  locale: string;
}

export type TemplateMap = Partial<Record<WhatsAppIntent, TemplateConfig>>;

export type WhatsAppDelivery =
  | { kind: "free_form" }
  | { kind: "template"; name: string; locale: string }
  | { kind: "blocked"; reason: "paused" | "guardian_only" | "approval_required" | "opted_out" | "template_unavailable" };

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
    ["human_attention", env.WHATSAPP_TEMPLATE_HUMAN_ATTENTION],
  ];
  return Object.fromEntries(entries.filter((entry): entry is [WhatsAppIntent, string] => Boolean(entry[1])).map(([intent, name]) => [intent, { name, locale }]));
}
