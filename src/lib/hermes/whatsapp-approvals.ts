import { randomBytes } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = "[A-HJ-NP-Z2-9]{6}";

export interface ApprovalReply {
  decision: "approved" | "rejected";
  code: string;
}

export interface ApprovalSummary {
  start: string;
  end: string;
  timezone: string;
}

export function generateApprovalCode(bytes: Buffer = randomBytes(6)) {
  if (bytes.length < 6) throw new Error("insufficient_random_bytes");
  return Array.from(bytes.subarray(0, 6), (value) => CODE_ALPHABET[value & 31]).join("");
}

export function parseApprovalReply(input: { body?: unknown; interactiveId?: unknown }): ApprovalReply | null {
  if (typeof input.interactiveId === "string") {
    const match = input.interactiveId.match(new RegExp(`^approval:(approve|reject):(${CODE_PATTERN})$`, "i"));
    if (match) return { decision: match[1].toLowerCase() === "approve" ? "approved" : "rejected", code: match[2].toUpperCase() };
  }
  if (typeof input.body === "string") {
    const match = input.body.match(new RegExp(`^(APPROVE|REJECT) (${CODE_PATTERN})$`, "i"));
    if (match) return { decision: match[1].toUpperCase() === "APPROVE" ? "approved" : "rejected", code: match[2].toUpperCase() };
  }
  return null;
}

export function summarizeApprovalPayload(input: unknown): ApprovalSummary {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_approval_payload");
  const value = input as Record<string, unknown>;
  const start = typeof value.start === "string" ? new Date(value.start) : new Date(Number.NaN);
  const end = typeof value.end === "string" ? new Date(value.end) : new Date(Number.NaN);
  const timezone = typeof value.timezone === "string" ? value.timezone.trim() : "";
  if (
    !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start
    || end.getTime() - start.getTime() > 24 * 60 * 60 * 1000
    || !timezone || timezone.length > 100
    || (timezone !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(timezone))
  ) throw new Error("invalid_approval_payload");
  return { start: start.toISOString(), end: end.toISOString(), timezone };
}

export function buildApprovalTemplateMessage(input: {
  to: string;
  templateName: string;
  locale: string;
  code: string;
  approvalPayload: unknown;
}) {
  const to = input.to.replace(/\D/g, "");
  if (to.length < 8 || to.length > 15) throw new Error("invalid_admin_number");
  if (!/^[a-z0-9_]{1,512}$/.test(input.templateName)) throw new Error("invalid_template_name");
  if (!/^[A-Za-z_]{2,20}$/.test(input.locale)) throw new Error("invalid_template_locale");
  if (!new RegExp(`^${CODE_PATTERN}$`).test(input.code)) throw new Error("invalid_approval_code");
  const summary = summarizeApprovalPayload(input.approvalPayload);
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.locale },
      components: [
        { type: "body", parameters: [
          { type: "text", text: summary.start },
          { type: "text", text: summary.end },
          { type: "text", text: summary.timezone },
          { type: "text", text: input.code },
        ] },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `approval:approve:${input.code}` }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `approval:reject:${input.code}` }] },
      ],
    },
  };
}
