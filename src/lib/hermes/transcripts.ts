export type TranscriptSpeaker = "contact" | "kitty";

export interface TranscriptSyncMessage {
  messageId: number;
  speaker: TranscriptSpeaker;
  text: string;
  occurredAt: string;
}

export interface TranscriptSyncRequest {
  sessionId: string;
  whatsappUserId: string;
  messages: TranscriptSyncMessage[];
}

export interface WhatsAppDeliverySyncMessage {
  messageId: string;
  text: string;
  occurredAt: string;
}

export interface WhatsAppDeliverySyncRequest {
  source: "whatsapp_delivery";
  whatsappUserId: string;
  messages: WhatsAppDeliverySyncMessage[];
}

export interface TranscriptDatabaseRow {
  contact_id: string;
  hermes_session_id: string;
  hermes_message_id: number;
  speaker: TranscriptSpeaker;
  body: string;
  occurred_at: string;
}

export interface WhatsAppDeliveryDatabaseRow {
  contact_id: string;
  direction: "outbound";
  message_kind: "text";
  intent: "gateway_transcript";
  body: string;
  meta_message_id: string;
  idempotency_key: string;
  status: "sent";
  occurred_at: string;
}

export type TranscriptSyncParseResult =
  | {
      ok: true;
      value: TranscriptSyncRequest | WhatsAppDeliverySyncRequest;
    }
  | { ok: false; error: string };

const REQUEST_KEYS = new Set(["sessionId", "whatsappUserId", "messages"]);
const DELIVERY_REQUEST_KEYS = new Set([
  "source",
  "whatsappUserId",
  "messages",
]);
const MESSAGE_KEYS = new Set([
  "messageId",
  "speaker",
  "text",
  "occurredAt",
]);
const DELIVERY_MESSAGE_KEYS = new Set(["messageId", "text", "occurredAt"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WHATSAPP_MESSAGE_ID = /^wamid\.[A-Za-z0-9._=-]{10,255}$/;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: Set<string>,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.size &&
    keys.every((key) => expected.has(key))
  );
}

function invalid(error: string): TranscriptSyncParseResult {
  return { ok: false, error };
}

export function normalizeWhatsAppUserId(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function parseTranscriptSyncRequest(
  input: unknown,
): TranscriptSyncParseResult {
  if (!isPlainObject(input)) {
    return invalid("Invalid request shape");
  }

  if (
    input.source === "whatsapp_delivery" &&
    hasExactKeys(input, DELIVERY_REQUEST_KEYS)
  ) {
    if (typeof input.whatsappUserId !== "string") {
      return invalid("Invalid WhatsApp user ID");
    }
    const whatsappUserId = normalizeWhatsAppUserId(input.whatsappUserId);
    if (!whatsappUserId) {
      return invalid("Invalid WhatsApp user ID");
    }
    if (
      !Array.isArray(input.messages) ||
      input.messages.length < 1 ||
      input.messages.length > 100
    ) {
      return invalid("Invalid message batch size");
    }

    const messages: WhatsAppDeliverySyncMessage[] = [];
    const seenIds = new Set<string>();
    for (const candidate of input.messages) {
      if (
        !isPlainObject(candidate) ||
        !hasExactKeys(candidate, DELIVERY_MESSAGE_KEYS)
      ) {
        return invalid("Invalid delivery message shape");
      }
      if (
        typeof candidate.messageId !== "string" ||
        !WHATSAPP_MESSAGE_ID.test(candidate.messageId) ||
        seenIds.has(candidate.messageId)
      ) {
        return invalid("Invalid delivery message ID");
      }
      if (typeof candidate.text !== "string") {
        return invalid("Invalid message text");
      }
      const text = candidate.text.trim();
      if (text.length < 1 || text.length > 65_536) {
        return invalid("Invalid message text");
      }
      if (typeof candidate.occurredAt !== "string") {
        return invalid("Invalid message timestamp");
      }
      const occurredAtDate = new Date(candidate.occurredAt);
      if (!Number.isFinite(occurredAtDate.valueOf())) {
        return invalid("Invalid message timestamp");
      }
      seenIds.add(candidate.messageId);
      messages.push({
        messageId: candidate.messageId,
        text,
        occurredAt: occurredAtDate.toISOString(),
      });
    }
    return {
      ok: true,
      value: {
        source: "whatsapp_delivery",
        whatsappUserId,
        messages,
      },
    };
  }

  if (!hasExactKeys(input, REQUEST_KEYS)) {
    return invalid("Invalid request shape");
  }

  const sessionId =
    typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  if (
    sessionId.length < 1 ||
    sessionId.length > 128 ||
    CONTROL_CHARACTERS.test(sessionId)
  ) {
    return invalid("Invalid session ID");
  }

  if (typeof input.whatsappUserId !== "string") {
    return invalid("Invalid WhatsApp user ID");
  }
  const whatsappUserId = normalizeWhatsAppUserId(input.whatsappUserId);
  if (!whatsappUserId) {
    return invalid("Invalid WhatsApp user ID");
  }

  if (
    !Array.isArray(input.messages) ||
    input.messages.length < 1 ||
    input.messages.length > 100
  ) {
    return invalid("Invalid message batch size");
  }

  const messages: TranscriptSyncMessage[] = [];
  let previousMessageId = 0;

  for (const candidate of input.messages) {
    if (!isPlainObject(candidate) || !hasExactKeys(candidate, MESSAGE_KEYS)) {
      return invalid("Invalid message shape");
    }

    const messageId = candidate.messageId;
    if (
      typeof messageId !== "number" ||
      !Number.isSafeInteger(messageId) ||
      messageId <= previousMessageId
    ) {
      return invalid("Message IDs must be positive and strictly increasing");
    }

    const speaker = candidate.speaker;
    if (speaker !== "contact" && speaker !== "kitty") {
      return invalid("Invalid message speaker");
    }

    if (typeof candidate.text !== "string") {
      return invalid("Invalid message text");
    }
    const text = candidate.text.trim();
    if (text.length < 1 || text.length > 65_536) {
      return invalid("Invalid message text");
    }

    if (typeof candidate.occurredAt !== "string") {
      return invalid("Invalid message timestamp");
    }
    const occurredAtDate = new Date(candidate.occurredAt);
    if (!Number.isFinite(occurredAtDate.valueOf())) {
      return invalid("Invalid message timestamp");
    }

    messages.push({
      messageId,
      speaker,
      text,
      occurredAt: occurredAtDate.toISOString(),
    });
    previousMessageId = messageId;
  }

  return {
    ok: true,
    value: {
      sessionId,
      whatsappUserId,
      messages,
    },
  };
}

export function buildTranscriptRows(
  request: TranscriptSyncRequest,
  contactId: string,
): TranscriptDatabaseRow[] {
  return request.messages.map((message) => ({
    contact_id: contactId,
    hermes_session_id: request.sessionId,
    hermes_message_id: message.messageId,
    speaker: message.speaker,
    body: message.text,
    occurred_at: message.occurredAt,
  }));
}

export function buildWhatsAppDeliveryRows(
  request: WhatsAppDeliverySyncRequest,
  contactId: string,
): WhatsAppDeliveryDatabaseRow[] {
  return request.messages.map((message) => ({
    contact_id: contactId,
    direction: "outbound",
    message_kind: "text",
    intent: "gateway_transcript",
    body: message.text,
    meta_message_id: message.messageId,
    idempotency_key: `hermes-rich-sent:${message.messageId}`,
    status: "sent",
    occurred_at: message.occurredAt,
  }));
}
