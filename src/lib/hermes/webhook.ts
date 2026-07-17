import { createHmac, timingSafeEqual } from "node:crypto";

export type ProjectedWebhookEvent =
  | { kind: "message"; idempotencyKey: string; metaMessageId: string; waId: string; profileName: string | null; occurredAt: string; messageType: string; body: string | null; interactiveId?: string }
  | { kind: "status"; idempotencyKey: string; metaMessageId: string; waId: string; occurredAt: string; status: string; errorCode: string | null };

export function verifyMetaSignature(rawBody: Buffer, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const suppliedHex = header.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const actual = Buffer.from(suppliedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isWhatsAppOptOut(body: string | null) {
  if (!body) return false;
  const normalized = body.trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ");
  return ["stop", "unsubscribe", "cancel", "end", "quit", "opt out", "please stop", "please unsubscribe"].includes(normalized);
}

export function isInboundContactEligible(contact: {
  isActive: boolean;
  consentStatus: string;
  role: string;
  communicationPolicy: string;
}) {
  return contact.isActive
    && contact.consentStatus === "attested"
    && contact.role !== "unclassified"
    && contact.communicationPolicy === "direct";
}

function timestampToIso(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

export function filterWebhookPayload(payload: unknown, allowedMessageIds: Set<string>) {
  const clone = structuredClone(payload) as { entry?: Array<Record<string, unknown>> };
  if (!Array.isArray(clone?.entry)) return { object: "whatsapp_business_account", entry: [] };
  clone.entry = clone.entry.flatMap((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const filteredChanges = changes.flatMap((unknownChange) => {
      if (!unknownChange || typeof unknownChange !== "object") return [];
      const change = unknownChange as Record<string, unknown>;
      if (!change.value || typeof change.value !== "object") return [];
      const value = change.value as Record<string, unknown>;
      const messages = Array.isArray(value.messages)
        ? value.messages.filter((item) => item && typeof item === "object" && allowedMessageIds.has(String((item as Record<string, unknown>).id ?? "")))
        : [];
      if (messages.length === 0) return [];
      const senders = new Set(messages.map((item) => String((item as Record<string, unknown>).from ?? "")));
      return [{ ...change, value: { ...value, messages, contacts: Array.isArray(value.contacts) ? value.contacts.filter((item) => item && typeof item === "object" && senders.has(String((item as Record<string, unknown>).wa_id ?? ""))) : [], statuses: [] } }];
    });
    return filteredChanges.length > 0 ? [{ ...entry, changes: filteredChanges }] : [];
  });
  return clone;
}

export function projectWebhookEvents(payload: unknown): ProjectedWebhookEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.entry)) return [];
  const events: ProjectedWebhookEvent[] = [];

  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object" || !Array.isArray((entry as Record<string, unknown>).changes)) continue;
    for (const change of (entry as { changes: unknown[] }).changes) {
      if (!change || typeof change !== "object") continue;
      const record = change as Record<string, unknown>;
      if (record.field !== "messages" || !record.value || typeof record.value !== "object") continue;
      const value = record.value as Record<string, unknown>;
      const names = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        value.contacts.forEach((item) => {
          const contact = item as { wa_id?: string; profile?: { name?: string } };
          if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
        });
      }
      if (Array.isArray(value.messages)) {
        value.messages.forEach((item) => {
          const message = item as {
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
            interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
            button?: { payload?: string; text?: string };
          };
          if (!message.id || !message.from) return;
          const occurredAt = timestampToIso(message.timestamp);
          if (!occurredAt) return;
          const interactiveId = message.type === "interactive" && message.interactive?.type === "button_reply"
            ? message.interactive.button_reply?.id
            : message.type === "button"
              ? message.button?.payload
              : undefined;
          const body = message.type === "text"
            ? message.text?.body ?? null
            : message.type === "interactive" && message.interactive?.type === "button_reply"
              ? message.interactive.button_reply?.title ?? null
              : message.type === "button"
                ? message.button?.text ?? null
                : null;
          events.push({
            kind: "message",
            idempotencyKey: `meta:message:${message.id}`,
            metaMessageId: message.id,
            waId: message.from,
            profileName: names.get(message.from) ?? null,
            occurredAt,
            messageType: message.type ?? "unknown",
            body,
            ...(typeof interactiveId === "string" && interactiveId.length <= 256 ? { interactiveId } : {}),
          });
        });
      }
      if (Array.isArray(value.statuses)) {
        value.statuses.forEach((item) => {
          const status = item as { id?: string; recipient_id?: string; timestamp?: string; status?: string; errors?: Array<{ code?: number }> };
          if (!status.id || !status.recipient_id || !status.status) return;
          const occurredAt = timestampToIso(status.timestamp);
          if (!occurredAt) return;
          events.push({
            kind: "status",
            idempotencyKey: `meta:status:${status.id}:${status.status}:${status.timestamp ?? "0"}`,
            metaMessageId: status.id,
            waId: status.recipient_id,
            occurredAt,
            status: status.status,
            errorCode: status.errors?.[0]?.code?.toString() ?? null,
          });
        });
      }
    }
  }
  return events;
}
