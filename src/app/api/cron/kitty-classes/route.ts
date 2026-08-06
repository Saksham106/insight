import { NextResponse } from "next/server";

import { signServiceRequest } from "@/lib/hermes/auth";
import { completePastKittyOccurrences, expandDueKittySeries, maintainKittyClassState } from "@/lib/hermes/kitty-class-service";
import { drainKittyClassNotifications } from "@/lib/hermes/kitty-class-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

async function maintain(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.KITTY_CLASS_CALENDAR_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const senderSecret = process.env.WHATSAPP_SENDER_SHARED_SECRET;
  if (!senderSecret) return NextResponse.json({ error: "Sender unavailable" }, { status: 503 });
  const client = createAdminClient();
  const maintenance = await maintainKittyClassState(client);
  const expansion = await expandDueKittySeries(client);
  const completedOccurrences = await completePastKittyOccurrences(client);
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
    const result = await fetch(new URL("/api/whatsapp/send", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hermes-timestamp": timestamp,
        "x-hermes-request-id": requestId,
        "x-hermes-signature": signServiceRequest(body, timestamp, requestId, senderSecret),
      },
      body,
    });
    const responseBody = await result.json().catch(() => ({}));
    if (!result.ok) return { status: responseBody.blocked === true ? "blocked" as const : "failed" as const, errorCode: typeof responseBody.error === "string" ? responseBody.error : "delivery_failed" };
    return { status: "sent" as const, messageId: typeof responseBody?.message?.id === "string" ? responseBody.message.id : null };
  }, 20);
  return NextResponse.json({
    expandedSeries: expansion.expandedSeries,
    createdOccurrences: expansion.createdOccurrences,
    completedOccurrences,
    expiredRequests: maintenance?.expiredRequests ?? 0,
    reclaimedNotifications: maintenance?.reclaimedNotifications ?? 0,
    sentNotifications: delivery.sent,
    failedNotifications: delivery.failed,
    blockedNotifications: delivery.blocked,
    deliverySlaSeconds: 60,
  });
}

export const GET = maintain;
export const POST = maintain;
