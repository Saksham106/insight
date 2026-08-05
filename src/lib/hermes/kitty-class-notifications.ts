import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppIntent } from "./meta";

export type KittyNotificationSend = (input: {
  outboxId: string;
  contactId: string;
  occurrenceId: string;
  intent: WhatsAppIntent;
  templateData: Record<string, string>;
  idempotencyKey: string;
}) => Promise<{ status: "sent"; messageId: string | null } | { status: "failed" | "blocked"; errorCode: string }>;

function displayTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export async function drainKittyClassNotifications(client: SupabaseClient, sender: KittyNotificationSend, limit = 20) {
  const { data: pending, error } = await client.from("kitty_class_notification_outbox")
    .select("id, occurrence_id, change_request_id, contact_id, intent, payload, idempotency_key, attempt_count")
    .in("status", ["pending", "failed"]).lte("available_at", new Date().toISOString())
    .lt("attempt_count", 10).order("created_at").limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error("notification_outbox_unavailable");
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  for (const row of pending ?? []) {
    const { data: claimed } = await client.from("kitty_class_notification_outbox")
      .update({ status: "sending", attempt_count: row.attempt_count + 1 })
      .eq("id", row.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (!claimed) continue;
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    const replacementId = typeof payload.replacementOccurrenceId === "string" ? payload.replacementOccurrenceId : null;
    const [{ data: occurrence }, replacementResult] = await Promise.all([
      client.from("kitty_class_occurrences").select("id, title, subject, starts_at, timezone").eq("id", row.occurrence_id).maybeSingle(),
      replacementId
        ? client.from("kitty_class_occurrences").select("starts_at, timezone").eq("id", replacementId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!occurrence) {
      await client.from("kitty_class_notification_outbox").update({ status: "blocked", last_error_code: "occurrence_unavailable" }).eq("id", row.id);
      blocked += 1;
      continue;
    }
    const referenceCode = String(row.change_request_id ?? row.id).replaceAll("-", "").slice(0, 6).toUpperCase();
    const templateData: Record<string, string> = {
      classDescription: occurrence.subject || occurrence.title,
      originalDateTime: displayTime(occurrence.starts_at, occurrence.timezone),
      referenceCode,
    };
    if (replacementResult.data) templateData.replacementDateTime = displayTime(replacementResult.data.starts_at, replacementResult.data.timezone);
    const result = await sender({
      outboxId: row.id, contactId: row.contact_id, occurrenceId: row.occurrence_id,
      intent: row.intent as WhatsAppIntent, templateData, idempotencyKey: row.idempotency_key,
    });
    if (result.status === "sent") {
      await client.from("kitty_class_notification_outbox").update({ status: "sent", hermes_message_id: result.messageId, last_error_code: null }).eq("id", row.id);
      sent += 1;
    } else {
      await client.from("kitty_class_notification_outbox").update({ status: result.status, last_error_code: result.errorCode, available_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", row.id);
      if (result.status === "blocked") blocked += 1;
      else failed += 1;
    }
  }
  return { sent, failed, blocked };
}

