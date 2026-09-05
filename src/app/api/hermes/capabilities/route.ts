import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  evaluateAction,
  executeEvaluatedAction,
  feeStatementLookupErrorStatus,
  listAgentCapabilities,
} from "@/lib/hermes/agent-actions";
import { executeAgentCapability } from "@/lib/hermes/agent-capability-executor";
import { parseAgentCapabilityRequest } from "@/lib/hermes/agent-capability-request";
import { createSupabaseAgentActionStore, createSupabaseAgentPolicyRepository } from "@/lib/hermes/agent-supabase";
import { verifyServiceRequest } from "@/lib/hermes/auth";
import { communicationDecision, parseIMessageAdminActor, parseWhatsAppToolActor } from "@/lib/hermes/cases";
import { deliverPendingKittyClassNotifications } from "@/lib/hermes/kitty-class-delivery";
import type { AgentActor } from "@/lib/hermes/agent-capability-types";
import { createAdminClient } from "@/lib/supabase/admin";

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 64_000) return response("invalid_capability_request", 413);
  let parsed;
  try { parsed = parseAgentCapabilityRequest(JSON.parse(raw)); } catch { return response("invalid_capability_request", 400); }
  const imessageActor = parseIMessageAdminActor(parsed.actor, process.env.HERMES_ADMIN_IMESSAGE_ID_SHA256);
  const whatsappActor = parseWhatsAppToolActor(parsed.actor);
  const signingSecret = imessageActor ? process.env.HERMES_ADMIN_TOOL_SHARED_SECRET : process.env.HERMES_TOOL_SHARED_SECRET;
  const auth = signingSecret ? verifyServiceRequest(request, raw, signingSecret) : null;
  if (!auth || (!imessageActor && !whatsappActor)) return response("unauthorized", 401);

  const client = createAdminClient();
  let actor: AgentActor;
  if (imessageActor) {
    actor = {
      kind: "admin",
      profileId: null,
      externalIdHash: createHash("sha256").update(imessageActor.stableId, "utf8").digest("hex"),
      channel: "imessage",
    };
  } else {
    const { data: contact } = await client.from("hermes_contacts")
      .select("id, role, consent_status, communication_policy, is_active")
      .eq("whatsapp_e164", whatsappActor!.e164).eq("is_active", true).is("deleted_at", null).maybeSingle();
    const allowedRoles = ["teacher", "student", "parent", "employee", "other", "unclassified"] as const;
    if (!contact || !allowedRoles.includes(contact.role)
      || !communicationDecision({ consentStatus: contact.consent_status, communicationPolicy: contact.communication_policy, isActive: contact.is_active }).allowed) {
      return response("communication_blocked", 403);
    }
    actor = { kind: "contact", contactId: contact.id, role: contact.role, channel: "whatsapp" };
  }

  const { error: replayError } = await client.from("hermes_audit_events").insert({
    actor_type: actor.kind === "admin" ? "admin" : "contact",
    actor_contact_id: actor.kind === "contact" ? actor.contactId : null,
    event_type: "agent_capability_requested", entity_type: "agent_action", request_id: auth.requestId,
    metadata: { operation: parsed.operation },
  });
  if (replayError) return response(replayError.code === "23505" ? "replay_rejected" : "audit_unavailable", replayError.code === "23505" ? 409 : 503);
  if (parsed.operation === "list_capabilities") return NextResponse.json({ capabilities: listAgentCapabilities(actor) });

  const evaluationSecret = process.env.ACADEMY_AGENT_EVALUATION_SECRET;
  if (!evaluationSecret) return response("capability_service_unavailable", 503);
  const store = createSupabaseAgentActionStore(client, actor.channel);
  try {
    if (parsed.operation === "evaluate_action") {
      const result = await evaluateAction(store, createSupabaseAgentPolicyRepository(client), actor, parsed.payload, { secret: evaluationSecret });
      return NextResponse.json(result, { status: result.decision.kind === "denied" ? 403 : 200 });
    }
    const result = await executeEvaluatedAction(store, actor, parsed.payload, {
      secret: evaluationSecret,
      execute: (action) => executeAgentCapability(client, action.actor, action),
    });
    const notificationDelivery = await deliverPendingKittyClassNotifications(client, request.url);
    return NextResponse.json({ ...result, notificationDelivery });
  } catch (error) {
    const code = error instanceof Error ? error.message : "capability_service_unavailable";
    const lookupStatus = feeStatementLookupErrorStatus(code);
    if (lookupStatus) return response(code, lookupStatus);
    if (["client_request_payload_mismatch", "action_execution_in_progress"].includes(code)) return response(code, 409);
    if (["evaluation_actor_mismatch", "invalid_evaluation_token", "expired_evaluation_token", "evaluation_not_found"].includes(code)) return response(code, 403);
    if (["invalid_client_request_id", "invalid_capability_request"].includes(code)) return response(code, 400);
    return response("capability_service_unavailable", 503);
  }
}
