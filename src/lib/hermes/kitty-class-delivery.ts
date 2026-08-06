import type { SupabaseClient } from "@supabase/supabase-js";

import { signServiceRequest } from "./auth";
import { drainKittyClassNotifications } from "./kitty-class-notifications";

export type KittyClassDeliveryResult = {
  sent: number;
  failed: number;
  blocked: number;
  unavailable: boolean;
};

export async function deliverPendingKittyClassNotifications(
  client: SupabaseClient,
  requestUrl: string,
  limit = 20,
): Promise<KittyClassDeliveryResult> {
  const secret = process.env.WHATSAPP_SENDER_SHARED_SECRET;
  if (!secret) return { sent: 0, failed: 0, blocked: 0, unavailable: true };

  try {
    const delivery = await drainKittyClassNotifications(client, async (item) => {
      const body = JSON.stringify({
        contactId: item.contactId,
        occurrenceId: item.occurrenceId,
        classOutboxId: item.outboxId,
        intent: item.intent,
        templateData: item.templateData,
        idempotencyKey: item.idempotencyKey,
      });
      const timestamp = Date.now().toString();
      const requestId = `kitty-class-send-${crypto.randomUUID()}`;
      try {
        const result = await fetch(new URL("/api/whatsapp/send", requestUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hermes-timestamp": timestamp,
            "x-hermes-request-id": requestId,
            "x-hermes-signature": signServiceRequest(body, timestamp, requestId, secret),
          },
          body,
        });
        const responseBody = await result.json().catch(() => ({}));
        if (!result.ok) {
          return {
            status: responseBody.blocked === true ? "blocked" as const : "failed" as const,
            errorCode: typeof responseBody.error === "string" ? responseBody.error : "delivery_failed",
          };
        }
        return {
          status: "sent" as const,
          messageId: typeof responseBody?.message?.id === "string" ? responseBody.message.id : null,
        };
      } catch {
        return { status: "failed" as const, errorCode: "sender_unavailable" };
      }
    }, limit);
    return { ...delivery, unavailable: false };
  } catch {
    return { sent: 0, failed: 0, blocked: 0, unavailable: true };
  }
}
