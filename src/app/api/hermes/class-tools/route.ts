import { NextResponse } from "next/server";

import { verifyServiceRequest } from "@/lib/hermes/auth";
import { communicationDecision, parseIMessageAdminActor, parseWhatsAppToolActor } from "@/lib/hermes/cases";
import { executeKittyClassTool, isKittyClassToolAction } from "@/lib/hermes/kitty-class-tools";
import { createAdminClient } from "@/lib/supabase/admin";

type JsonObject = Record<string, unknown>;

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (process.env.KITTY_CLASS_CALENDAR_ENABLED !== "true") return response("Not found", 404);
  const raw = await request.text();
  let body: JsonObject;
  try {
    body = JSON.parse(raw) as JsonObject;
  } catch {
    return response("Invalid JSON", 400);
  }
  const actorPayload = body.actor;
  const imessageActor = parseIMessageAdminActor(actorPayload, process.env.HERMES_ADMIN_IMESSAGE_ID_SHA256);
  const whatsappActor = parseWhatsAppToolActor(actorPayload);
  const secret = imessageActor ? process.env.HERMES_ADMIN_TOOL_SHARED_SECRET : process.env.HERMES_TOOL_SHARED_SECRET;
  const auth = secret ? verifyServiceRequest(request, raw, secret) : null;
  if (!auth || (!imessageActor && !whatsappActor)) return response("Unauthorized", 401);
  if (!isKittyClassToolAction(body.action)) return response("Unsupported action", 400);
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return response("Invalid payload", 400);

  const supabase = createAdminClient();
  let actor;
  if (imessageActor) {
    actor = { kind: "admin" as const, profileId: null, channel: "imessage" as const };
  } else {
    const { data: contact } = await supabase.from("hermes_contacts")
      .select("id, consent_status, communication_policy, is_active")
      .eq("whatsapp_e164", whatsappActor!.e164).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (!contact || !communicationDecision({ consentStatus: contact.consent_status, communicationPolicy: contact.communication_policy, isActive: contact.is_active }).allowed) {
      return response("This action is not available for this WhatsApp contact", 403);
    }
    actor = { kind: "contact" as const, contactId: contact.id, channel: "whatsapp" as const };
  }
  const auditId = crypto.randomUUID();
  const { error: replayError } = await supabase.from("kitty_class_audit_events").insert({
    id: auditId,
    actor_type: actor.kind === "admin" ? "admin" : "contact",
    actor_contact_id: actor.kind === "contact" ? actor.contactId : null,
    event_type: "class_tool_requested", entity_type: "notification", entity_id: auditId,
    request_id: auth.requestId, metadata: { action: body.action },
  });
  if (replayError) return response(replayError.code === "23505" ? "Replay rejected" : "Audit unavailable", replayError.code === "23505" ? 409 : 503);
  try {
    const result = await executeKittyClassTool(supabase, actor, body.action, body.payload as JsonObject);
    await supabase.from("kitty_class_audit_events").update({ event_type: "class_tool_completed" }).eq("id", auditId);
    return NextResponse.json(result);
  } catch (error) {
    const category = error instanceof Error && ["action_not_allowed", "class_not_found", "stale_class", "invalid_payload", "change_not_permitted", "invalid_ambiguity", "ambiguity_not_permitted"].includes(error.message)
      ? error.message : "class_tool_failed";
    await supabase.from("kitty_class_audit_events").update({ event_type: "class_tool_rejected", metadata: { action: body.action, category } }).eq("id", auditId);
    return response(category, category === "class_not_found" ? 404 : category === "stale_class" ? 409 : 400);
  }
}
