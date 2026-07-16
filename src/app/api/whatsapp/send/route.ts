import { NextResponse } from "next/server";

import { verifyServiceRequest } from "@/lib/hermes/auth";
import { buildGraphMessageRequest, classifyMetaFailure, selectWhatsAppDelivery, templateMapFromEnv, type WhatsAppIntent } from "@/lib/hermes/meta";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.WHATSAPP_SENDER_SHARED_SECRET;
  const auth = secret ? verifyServiceRequest(request, rawBody, secret) : null;
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contactId?: string; caseId?: string; intent?: WhatsAppIntent; text?: string; bodyParameters?: string[]; idempotencyKey?: string; approvalId?: string };
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.contactId || !body.caseId || !body.intent || !body.idempotencyKey) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const supabase = createAdminClient();
  const { error: replayError } = await supabase.from("hermes_audit_events").insert({ actor_type: "system", event_type: "sender_request", entity_type: "sender", request_id: auth.requestId, metadata: { intent: body.intent } });
  if (replayError) return NextResponse.json({ error: replayError.code === "23505" ? "Replay rejected" : "Audit unavailable" }, { status: replayError.code === "23505" ? 409 : 503 });
  const { data: prior } = await supabase.from("hermes_messages").select("id, status, meta_message_id, error_code").eq("idempotency_key", body.idempotencyKey).maybeSingle();
  if (prior) return NextResponse.json({ message: prior, duplicate: true });

  const { data: contact } = await supabase
    .from("hermes_contacts")
    .select("id, whatsapp_e164, communication_policy, consent_status, service_window_expires_at")
    .eq("id", body.contactId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact unavailable" }, { status: 404 });

  const [{ data: caseRecord }, { data: participant }, { count: recentCount }] = await Promise.all([
    supabase.from("hermes_scheduling_cases").select("id, human_takeover").eq("id", body.caseId).maybeSingle(),
    supabase.from("hermes_case_participants").select("id").eq("case_id", body.caseId).eq("contact_id", body.contactId).maybeSingle(),
    supabase.from("hermes_messages").select("id", { count: "exact", head: true }).eq("direction", "outbound").gte("created_at", new Date(Date.now() - 60_000).toISOString()),
  ]);
  if (!caseRecord || !participant) return NextResponse.json({ error: "Contact is not a case participant" }, { status: 403 });
  if (caseRecord.human_takeover) return NextResponse.json({ error: "Swati has taken over this case" }, { status: 409 });
  if ((recentCount ?? 0) >= 20) return NextResponse.json({ error: "Sender rate limit reached" }, { status: 429 });

  let approved = false;
  if (body.approvalId) {
    const { data: approval } = await supabase.from("hermes_approvals").select("id").eq("id", body.approvalId).eq("case_id", body.caseId).eq("status", "approved").is("consumed_at", null).maybeSingle();
    approved = Boolean(approval);
  }

  const delivery = selectWhatsAppDelivery({
    communicationPolicy: contact.communication_policy,
    consentStatus: contact.consent_status,
    serviceWindowExpiresAt: contact.service_window_expires_at,
  }, body.intent, new Date(), templateMapFromEnv(process.env), approved);
  if (delivery.kind === "blocked") return NextResponse.json({ error: delivery.reason }, { status: 409 });

  const { data: pending, error: insertError } = await supabase.from("hermes_messages").insert({
    contact_id: contact.id,
    case_id: body.caseId ?? null,
    direction: "outbound",
    message_kind: delivery.kind === "template" ? "template" : "text",
    intent: body.intent,
    template_name: delivery.kind === "template" ? delivery.name : null,
    template_locale: delivery.kind === "template" ? delivery.locale : null,
    body: body.text ?? null,
    idempotency_key: body.idempotencyKey,
    status: "pending",
  }).select("id").single();
  if (insertError || !pending) return NextResponse.json({ error: "Could not reserve message" }, { status: 500 });

  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v23.0";
  if (!phoneNumberId || !accessToken) return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });

  const graphPayload = buildGraphMessageRequest({ to: contact.whatsapp_e164, delivery, body: body.text, bodyParameters: body.bodyParameters });
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(graphPayload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const graphCode = typeof result?.error?.code === "number" ? result.error.code : undefined;
    await supabase.from("hermes_messages").update({ status: "failed", error_code: graphCode?.toString() ?? response.status.toString(), error_detail: classifyMetaFailure(response.status, graphCode) }).eq("id", pending.id);
    return NextResponse.json({ error: "WhatsApp rejected the message", retryable: classifyMetaFailure(response.status, graphCode) === "retryable" }, { status: 502 });
  }

  const metaMessageId = result?.messages?.[0]?.id ?? null;
  const { data: sent } = await supabase.from("hermes_messages").update({ status: "accepted", meta_message_id: metaMessageId }).eq("id", pending.id).select("id, status, meta_message_id").single();
  return NextResponse.json({ message: sent });
}
