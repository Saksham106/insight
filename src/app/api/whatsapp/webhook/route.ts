import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { projectWebhookEvents, verifyMetaSignature } from "@/lib/hermes/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_CLOUD_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const appSecret = process.env.WHATSAPP_CLOUD_APP_SECRET;
  const metaSignature = request.headers.get("x-hub-signature-256");
  if (!appSecret || !verifyMetaSignature(raw, metaSignature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const events = projectWebhookEvents(payload);
  const supabase = createAdminClient();
  const forwardMessageIds: string[] = [];
  let allMessagesEligible = true;

  for (const event of events) {
    if (event.kind === "status") {
      const allowedStatus = ["sent", "delivered", "read", "failed"].includes(event.status) ? event.status : "failed";
      await supabase.from("hermes_messages").update({ status: allowedStatus, error_code: event.errorCode, occurred_at: event.occurredAt }).eq("meta_message_id", event.metaMessageId);
      continue;
    }

    const e164 = `+${event.waId.replace(/\D/g, "")}`;
    let { data: contact } = await supabase
      .from("hermes_contacts")
      .select("id, communication_policy, consent_status, is_active")
      .eq("whatsapp_e164", e164)
      .is("deleted_at", null)
      .maybeSingle();

    if (!contact) {
      const created = await supabase.from("hermes_contacts").insert({
        display_name: event.profileName?.trim() || "Unknown WhatsApp contact",
        whatsapp_e164: e164,
        role: "unclassified",
        communication_policy: "approval_required",
        consent_status: "pending",
        consent_source: "whatsapp",
        consent_attested_by: null,
      }).select("id, communication_policy, consent_status, is_active").single();
      contact = created.data;
      if (contact) await supabase.from("hermes_audit_events").insert({ actor_type: "system", actor_contact_id: contact.id, event_type: "unknown_contact_received", entity_type: "hermes_contact", entity_id: contact.id });
    }
    if (!contact) {
      allMessagesEligible = false;
      continue;
    }

    const windowExpiry = new Date(new Date(event.occurredAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("hermes_contacts").update({ last_inbound_at: event.occurredAt, service_window_expires_at: windowExpiry }).eq("id", contact.id);
    const eligible = contact.is_active && contact.consent_status === "attested" && contact.communication_policy === "direct";

    const { data: inserted } = await supabase.from("hermes_messages").upsert({
      contact_id: contact.id,
      direction: "inbound",
      message_kind: ["text", "interactive", "image", "audio", "video", "document"].includes(event.messageType) ? (event.messageType === "text" ? "text" : event.messageType === "interactive" ? "interactive" : "media") : "unknown",
      body: event.body,
      meta_message_id: event.metaMessageId,
      idempotency_key: event.idempotencyKey,
      status: eligible ? "received" : "ignored",
      occurred_at: event.occurredAt,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id, forwarded_at").maybeSingle();

    const message = inserted ?? (await supabase.from("hermes_messages").select("id, forwarded_at").eq("idempotency_key", event.idempotencyKey).maybeSingle()).data;
    if (eligible && message && !message.forwarded_at) forwardMessageIds.push(message.id);
    if (!eligible) allMessagesEligible = false;
  }

  if (forwardMessageIds.length > 0 && allMessagesEligible) {
    const forwardUrl = process.env.HERMES_FORWARD_URL;
    const forwardSecret = process.env.HERMES_TOOL_SHARED_SECRET;
    if (!forwardUrl || !forwardSecret || forwardUrl === request.url) return NextResponse.json({ error: "Hermes forwarding is not configured" }, { status: 503 });
    const internalSignature = createHmac("sha256", forwardSecret).update(raw).digest("hex");
    const forwarded = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/json",
        "X-Hub-Signature-256": metaSignature ?? "",
        "X-Insight-Forward-Signature": `sha256=${internalSignature}`,
      },
      body: raw,
    });
    if (!forwarded.ok) return NextResponse.json({ error: "Hermes forwarding failed" }, { status: 502 });
    await supabase.from("hermes_messages").update({ forwarded_at: new Date().toISOString() }).in("id", forwardMessageIds);
  }

  return NextResponse.json({ received: true });
}
