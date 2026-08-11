import { NextResponse } from "next/server";

import { deliverPendingKittyClassNotifications } from "@/lib/hermes/kitty-class-delivery";
import { completePastKittyOccurrences, expandDueKittySeries, maintainKittyClassState } from "@/lib/hermes/kitty-class-service";
import { getClassReminderTemplateHealth } from "@/lib/hermes/meta-template-contract";
import { createAdminClient } from "@/lib/supabase/admin";

async function maintain(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hermesSecret = process.env.HERMES_TOOL_SHARED_SECRET;
  const authorization = request.headers.get("authorization");
  if ((!secret || authorization !== `Bearer ${secret}`) && (!hermesSecret || authorization !== `Bearer ${hermesSecret}`)) {
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
  const templateHealth = await getClassReminderTemplateHealth(fetch, process.env);
  const delivery = await deliverPendingKittyClassNotifications(client, request.url, 20);
  return NextResponse.json({
    expandedSeries: expansion.expandedSeries,
    createdOccurrences: expansion.createdOccurrences,
    completedOccurrences,
    expiredRequests: maintenance?.expiredRequests ?? 0,
    reclaimedNotifications: maintenance?.reclaimedNotifications ?? 0,
    sentNotifications: delivery.sent,
    failedNotifications: delivery.failed,
    blockedNotifications: delivery.blocked,
    templateContract: templateHealth.ok ? "healthy" : "blocked",
    deliveryMode: "immediate_with_daily_recovery",
  });
}

export const GET = maintain;
export const POST = maintain;
