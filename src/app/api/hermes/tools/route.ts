import { NextResponse } from "next/server";

import { signServiceRequest, verifyServiceRequest } from "@/lib/hermes/auth";
import { communicationDecision, projectContact, sanitizeAvailability } from "@/lib/hermes/cases";
import type { WhatsAppIntent } from "@/lib/hermes/meta";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTIONS = ["search_contacts", "get_contact", "create_case", "get_case", "record_availability", "propose_times", "request_approval", "confirm_class", "send_message", "escalate_to_swati"] as const;
type Action = (typeof ACTIONS)[number];
type JsonObject = Record<string, unknown>;
const CONTACT_FIELDS = "id, display_name, role, timezone, communication_policy, consent_status, is_active";

function failure(error: string, status = 400) { return NextResponse.json({ error }, { status }); }
function objectValue(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
  return value as JsonObject;
}
function stringValue(payload: JsonObject, key: string, max = 240) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`invalid_${key}`);
  return value.trim();
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.HERMES_TOOL_SHARED_SECRET;
  const auth = secret ? verifyServiceRequest(request, rawBody, secret) : null;
  if (!auth) return failure("Unauthorized", 401);

  let parsed: JsonObject;
  try { parsed = objectValue(JSON.parse(rawBody)); } catch { return failure("Invalid JSON"); }
  const action = parsed.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) return failure("Unsupported action");
  let payload: JsonObject;
  try { payload = objectValue(parsed.payload ?? {}); } catch { return failure("Invalid payload"); }

  const supabase = createAdminClient();
  const { error: replayError } = await supabase.from("hermes_audit_events").insert({ actor_type: "hermes", event_type: "tool_request", entity_type: "tool", request_id: auth.requestId, metadata: { action } });
  if (replayError) return failure(replayError.code === "23505" ? "Replay rejected" : "Audit unavailable", replayError.code === "23505" ? 409 : 503);
  const audit = async (eventType: string, entityType: string, entityId?: string, metadata: JsonObject = {}) => {
    await supabase.from("hermes_audit_events").insert({ actor_type: "hermes", event_type: eventType, entity_type: entityType, entity_id: entityId ?? null, metadata });
  };

  try {
    switch (action as Action) {
      case "search_contacts": {
        const query = stringValue(payload, "query", 100);
        let builder = supabase.from("hermes_contacts").select(CONTACT_FIELDS).eq("is_active", true).is("deleted_at", null).limit(10);
        builder = query.startsWith("+") ? builder.eq("whatsapp_e164", query.replace(/[\s()-]/g, "")) : builder.ilike("display_name", `%${query.replace(/[%_,]/g, "")}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return NextResponse.json({ contacts: (data ?? []).map(projectContact) });
      }
      case "get_contact": {
        const contactId = stringValue(payload, "contactId", 80);
        const { data, error } = await supabase.from("hermes_contacts").select(CONTACT_FIELDS).eq("id", contactId).eq("is_active", true).is("deleted_at", null).maybeSingle();
        if (error) throw error;
        if (!data) return failure("Contact not found", 404);
        return NextResponse.json({ contact: projectContact(data) });
      }
      case "create_case": {
        const title = stringValue(payload, "title");
        const requestedByContactId = typeof payload.requestedByContactId === "string" ? payload.requestedByContactId : null;
        if (!Array.isArray(payload.participants) || payload.participants.length < 1 || payload.participants.length > 10) return failure("Invalid participants");
        const normalized = payload.participants.map((entry) => {
          const item = objectValue(entry);
          const contactId = stringValue(item, "contactId", 80);
          const participantRole = stringValue(item, "participantRole", 30);
          if (!["teacher", "student", "parent", "administrator", "other"].includes(participantRole)) throw new Error("invalid_participant_role");
          return { contactId, participantRole };
        });
        if (new Set(normalized.map((item) => item.contactId)).size !== normalized.length) return failure("Duplicate participants");
        const { data: contacts, error: contactsError } = await supabase.from("hermes_contacts").select(CONTACT_FIELDS).in("id", normalized.map((item) => item.contactId)).eq("is_active", true).is("deleted_at", null);
        if (contactsError) throw contactsError;
        if ((contacts ?? []).length !== normalized.length) return failure("Participant unavailable", 409);
        const blocked = (contacts ?? []).find((contact) => !communicationDecision({ consentStatus: contact.consent_status, communicationPolicy: contact.communication_policy, isActive: contact.is_active }).allowed);
        if (blocked) return failure("Participant communication is restricted", 409);
        const { data: created, error } = await supabase.from("hermes_scheduling_cases").insert({ title, requested_by_contact_id: requestedByContactId, timezone: typeof payload.timezone === "string" ? payload.timezone.slice(0, 100) : null }).select("id, title, status, timezone, created_at").single();
        if (error || !created) throw error ?? new Error("case_create_failed");
        const { error: participantError } = await supabase.from("hermes_case_participants").insert(normalized.map((item) => ({ case_id: created.id, contact_id: item.contactId, participant_role: item.participantRole })));
        if (participantError) { await supabase.from("hermes_scheduling_cases").delete().eq("id", created.id); throw participantError; }
        await audit("case_created", "scheduling_case", created.id, { participantCount: normalized.length });
        return NextResponse.json({ case: created }, { status: 201 });
      }
      case "get_case": {
        const caseId = stringValue(payload, "caseId", 80);
        const { data: caseRecord, error } = await supabase.from("hermes_scheduling_cases").select("id, title, status, timezone, proposed_times, resolution, human_takeover, created_at, updated_at").eq("id", caseId).maybeSingle();
        if (error) throw error;
        if (!caseRecord) return failure("Case not found", 404);
        const { data: participants, error: participantsError } = await supabase.from("hermes_case_participants").select("contact_id, participant_role, availability, response_status, contact:hermes_contacts(id, display_name, role, timezone, communication_policy, consent_status, is_active)").eq("case_id", caseId);
        if (participantsError) throw participantsError;
        return NextResponse.json({ case: caseRecord, participants: (participants ?? []).map((item) => ({ contact: item.contact ? projectContact(Array.isArray(item.contact) ? item.contact[0] : item.contact) : null, participantRole: item.participant_role, availability: item.availability, responseStatus: item.response_status })) });
      }
      case "record_availability": {
        const caseId = stringValue(payload, "caseId", 80);
        const contactId = stringValue(payload, "contactId", 80);
        const availability = sanitizeAvailability(payload.availability);
        const { data: participant, error } = await supabase.from("hermes_case_participants").update({ availability, response_status: "responded" }).eq("case_id", caseId).eq("contact_id", contactId).select("id").maybeSingle();
        if (error) throw error;
        if (!participant) return failure("Contact is not a case participant", 403);
        await audit("availability_recorded", "scheduling_case", caseId, { contactId, windowCount: availability.length });
        return NextResponse.json({ recorded: true, windowCount: availability.length });
      }
      case "propose_times": {
        const caseId = stringValue(payload, "caseId", 80);
        const proposedTimes = sanitizeAvailability(payload.proposedTimes);
        if (proposedTimes.length === 0) return failure("At least one proposed time is required");
        const { data: proposedCase, error } = await supabase.rpc("propose_hermes_times", { p_case_id: caseId, p_proposed_times: proposedTimes });
        if (error || !proposedCase) throw error ?? new Error("proposal_failed");
        await audit("times_proposed", "scheduling_case", caseId, { count: proposedTimes.length });
        return NextResponse.json({ status: "proposing", proposedTimes, proposalVersion: proposedCase.proposal_version });
      }
      case "request_approval": {
        const caseId = stringValue(payload, "caseId", 80);
        const approvalPayload = objectValue(payload.approvalPayload ?? {});
        const { data: approval, error } = await supabase.rpc("request_hermes_approval", { p_case_id: caseId, p_payload: approvalPayload });
        if (error || !approval) throw error ?? new Error("approval_create_failed");
        await audit("approval_requested", "scheduling_case", caseId, { approvalId: approval.id });
        return NextResponse.json({ approval: { id: approval.id, case_id: approval.case_id, action: approval.action, status: approval.status, requested_at: approval.requested_at, payload: approval.payload } }, { status: 201 });
      }
      case "confirm_class": {
        const caseId = stringValue(payload, "caseId", 80);
        const approvalId = stringValue(payload, "approvalId", 80);
        const resolution = objectValue(payload.resolution ?? {});
        const { data: confirmedCase, error } = await supabase.rpc("confirm_hermes_class", { p_case_id: caseId, p_approval_id: approvalId, p_resolution: resolution });
        if (error || !confirmedCase) return failure("Approval is stale, consumed, or does not match this exact resolution", 409);
        await audit("class_confirmed", "scheduling_case", caseId, { approvalId });
        return NextResponse.json({ status: confirmedCase.status, resolution: confirmedCase.resolution });
      }
      case "send_message": {
        const contactId = stringValue(payload, "contactId", 80);
        const intent = stringValue(payload, "intent", 40) as WhatsAppIntent;
        if (!["availability_request", "time_proposal", "class_confirmation", "reschedule_request", "class_reminder", "human_attention"].includes(intent)) return failure("Invalid intent");
        const idempotencyKey = stringValue(payload, "idempotencyKey", 128);
        const caseId = stringValue(payload, "caseId", 80);
        const senderSecret = process.env.WHATSAPP_SENDER_SHARED_SECRET;
        if (!senderSecret) return failure("Sender unavailable", 503);
        const senderBody = JSON.stringify({ contactId, caseId, intent, text: typeof payload.text === "string" ? payload.text.slice(0, 2000) : undefined, bodyParameters: Array.isArray(payload.bodyParameters) ? payload.bodyParameters.slice(0, 10).map(String) : undefined, idempotencyKey, approvalId: typeof payload.approvalId === "string" ? payload.approvalId : undefined });
        const timestamp = Date.now().toString();
        const senderRequestId = `${auth.requestId}-send`;
        const response = await fetch(new URL("/api/whatsapp/send", request.url), { method: "POST", headers: { "content-type": "application/json", "x-hermes-timestamp": timestamp, "x-hermes-request-id": senderRequestId, "x-hermes-signature": signServiceRequest(senderBody, timestamp, senderRequestId, senderSecret) }, body: senderBody });
        const result = await response.json();
        await audit(response.ok ? "message_requested" : "message_rejected", "contact", contactId, { caseId: caseId ?? null, intent, status: response.status });
        return NextResponse.json(result, { status: response.status });
      }
      case "escalate_to_swati": {
        const caseId = stringValue(payload, "caseId", 80);
        const reason = stringValue(payload, "reason", 500);
        const { data: existing } = await supabase.from("hermes_scheduling_cases").select("id").eq("id", caseId).maybeSingle();
        if (!existing) return failure("Case not found", 404);
        const { error } = await supabase.from("hermes_scheduling_cases").update({ status: "needs_attention", human_takeover: true }).eq("id", caseId);
        if (error) throw error;
        await audit("human_escalation", "scheduling_case", caseId, { reason });
        return NextResponse.json({ status: "needs_attention", humanTakeover: true });
      }
    }
  } catch (error) {
    await audit("tool_error", "tool", undefined, { action, error: error instanceof Error ? error.message : "unknown" });
    const invalid = error instanceof Error && error.message.startsWith("invalid_");
    return failure(invalid ? error.message : "Action failed", invalid ? 400 : 500);
  }
}
