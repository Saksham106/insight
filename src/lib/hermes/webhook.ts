import { createHmac, timingSafeEqual } from "node:crypto";

export type ProjectedWebhookEvent =
  | { kind: "message"; idempotencyKey: string; metaMessageId: string; waId: string; profileName: string | null; occurredAt: string; messageType: string; body: string | null }
  | { kind: "status"; idempotencyKey: string; metaMessageId: string; waId: string; occurredAt: string; status: string; errorCode: string | null };

export function verifyMetaSignature(rawBody: Buffer, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const suppliedHex = header.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const actual = Buffer.from(suppliedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function timestampToIso(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date(0).toISOString();
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
          const message = item as { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } };
          if (!message.id || !message.from) return;
          events.push({
            kind: "message",
            idempotencyKey: `meta:message:${message.id}`,
            metaMessageId: message.id,
            waId: message.from,
            profileName: names.get(message.from) ?? null,
            occurredAt: timestampToIso(message.timestamp),
            messageType: message.type ?? "unknown",
            body: message.type === "text" ? message.text?.body ?? null : null,
          });
        });
      }
      if (Array.isArray(value.statuses)) {
        value.statuses.forEach((item) => {
          const status = item as { id?: string; recipient_id?: string; timestamp?: string; status?: string; errors?: Array<{ code?: number }> };
          if (!status.id || !status.recipient_id || !status.status) return;
          events.push({
            kind: "status",
            idempotencyKey: `meta:status:${status.id}:${status.status}:${status.timestamp ?? "0"}`,
            metaMessageId: status.id,
            waId: status.recipient_id,
            occurredAt: timestampToIso(status.timestamp),
            status: status.status,
            errorCode: status.errors?.[0]?.code?.toString() ?? null,
          });
        });
      }
    }
  }
  return events;
}
