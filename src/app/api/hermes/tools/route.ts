import { NextResponse } from "next/server";

import { signServiceRequest, verifyServiceRequest } from "@/lib/hermes/auth";
import { academyInformation, communicationDecision, parseIMessageAdminActor, parseWhatsAppToolActor, projectCaseParticipantsForActor, projectContact, sanitizeAvailability, toolActorScope } from "@/lib/hermes/cases";
import type { AcademyInformationTopic } from "@/lib/hermes/cases";
import type { WhatsAppIntent } from "@/lib/hermes/meta";
import { parseCalendarEventResult, parseFreeBusyPayload, parseFreeBusyResult, workspaceJobIdempotencyKey } from "@/lib/hermes/workspace-jobs";
import { buildApprovalTemplateMessage, generateApprovalCode } from "@/lib/hermes/whatsapp-approvals";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTIONS = ["get_academy_info", "search_contacts", "get_contact", "create_case", "get_case", "list_my_cases", "record_availability", "request_reschedule", "propose_times", "request_approval", "confirm_class", "send_message", "escalate_to_swati", "request_swati_freebusy", "get_workspace_job"] as const;
type Action = (typeof ACTIONS)[number];
type ToolMode = "whatsapp" | "imessage_admin";
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

export async function handleHermesToolPost(request: Request, mode: ToolMode) {
  if (mode === "imessage_admin" && process.env.HERMES_IMESSAGE_INTAKE_ENABLED !== "true") {
    return failure("Not found", 404);
  }
  const rawBody = await request.text();
  const secret = mode === "imessage_admin"
    ? process.env.HERMES_ADMIN_TOOL_SHARED_SECRET
    : process.env.HERMES_TOOL_SHARED_SECRET;
  const auth = secret ? verifyServiceRequest(request, rawBody, secret) : null;
  if (!auth) return failure("Unauthorized", 401);

  let parsed: JsonObject;
  try { parsed = objectValue(JSON.parse(rawBody)); } catch { return failure("Invalid JSON"); }
  const supabase = createAdminClient();
  const requestedAction = typeof parsed.action === "string" ? parsed.action.slice(0, 80) : "invalid";
  const { error: replayError } = await supabase.from("hermes_audit_events").insert({ actor_type: "hermes", event_type: "tool_request", entity_type: "tool", request_id: auth.requestId, metadata: { action: requestedAction, authorization: "pending" } });
  if (replayError) return failure(replayError.code === "23505" ? "Replay rejected" : "Audit unavailable", replayError.code === "23505" ? 409 : 503);
  const finalizeRequest = async (update: JsonObject) => {
    const { data, error } = await supabase.from("hermes_audit_events").update(update).eq("request_id", auth.requestId).select("id").maybeSingle();
    return !error && Boolean(data);
  };
  const rejectRequest = async (error: string, status: number, reason: string) => {
    const recorded = await finalizeRequest({ event_type: "tool_rejected", metadata: { action: requestedAction, authorization: reason } });
    return recorded ? failure(error, status) : failure("Audit unavailable", 503);
  };
  const action = parsed.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) return rejectRequest("Unsupported action", 400, "unsupported_action");
  let payload: JsonObject;
  try { payload = objectValue(parsed.payload ?? {}); } catch { return rejectRequest("Invalid payload", 400, "invalid_payload"); }

  const imessageActor = mode === "imessage_admin"
    ? parseIMessageAdminActor(parsed.actor, process.env.HERMES_ADMIN_IMESSAGE_ID_SHA256)
    : null;
  const whatsappActor = mode === "whatsapp" ? parseWhatsAppToolActor(parsed.actor) : null;
  if (!imessageActor && !whatsappActor) {
    return rejectRequest("A verified direct messaging session is required", 403, "invalid_session");
  }
  const adminE164 = process.env.HERMES_ADMIN_WHATSAPP_E164;
  const { data: actorContact } = imessageActor || whatsappActor?.e164 === adminE164
    ? { data: null }
    : await supabase
        .from("hermes_contacts")
        .select(CONTACT_FIELDS)
        .eq("whatsapp_e164", whatsappActor!.e164)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
  const actorKind = imessageActor || whatsappActor?.e164 === adminE164
    ? "admin"
    : actorContact && communicationDecision({
        consentStatus: actorContact.consent_status,
        communicationPolicy: actorContact.communication_policy,
        isActive: actorContact.is_active,
      }).allowed
      ? "contact"
      : "unknown";
  const actorScope = toolActorScope(action, actorKind);
  const actorType = actorKind === "admin" ? "admin" : actorKind === "contact" ? "contact" : "hermes";
  const authorizationRecorded = await finalizeRequest({ actor_type: actorType, actor_contact_id: actorContact?.id ?? null, event_type: actorScope === "denied" ? "tool_rejected" : "tool_request", metadata: { action, actorKind, authorization: actorScope === "denied" ? "denied" : "allowed" } });
  if (!authorizationRecorded) return failure("Audit unavailable", 503);
  if (actorScope === "denied") return failure("This action is not available for this WhatsApp contact", 403);
  const audit = async (eventType: string, entityType: string, entityId?: string, metadata: JsonObject = {}) => {
    await supabase.from("hermes_audit_events").insert({ actor_type: actorType, actor_contact_id: actorContact?.id ?? null, event_type: eventType, entity_type: entityType, entity_id: entityId ?? null, metadata: { actorKind, ...metadata } });
  };
  const requireCaseMembership = async (caseId: string) => {
    if (actorKind === "admin") return true;
    const { data } = await supabase.from("hermes_case_participants").select("id").eq("case_id", caseId).eq("contact_id", actorContact!.id).maybeSingle();
    return Boolean(data);
  };

  try {
    switch (action as Action) {
      case "get_academy_info": {
        const topic = stringValue(payload, "topic", 40) as AcademyInformationTopic;
        if (!["about", "scheduling", "privacy", "ai_assistant", "subjects", "contact"].includes(topic)) return failure("Invalid Academy information topic");
        return NextResponse.json(academyInformation(topic));
      }
      case "search_contacts": {
        const query = stringValue(payload, "query", 100);
        let builder = supabase.from("hermes_contacts").select(CONTACT_FIELDS).eq("is_active", true).is("deleted_at", null).limit(10);
        builder = query.startsWith("+") ? builder.eq("whatsapp_e164", query.replace(/[\s()-]/g, "")) : builder.ilike("display_name", `%${query.replace(/[%_,]/g, "")}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return NextResponse.json({ contacts: (data ?? []).map(projectContact) });
      }
      case "get_contact": {
        const contactId = actorKind === "contact" ? actorContact!.id : stringValue(payload, "contactId", 80);
        const { data, error } = await supabase.from("hermes_contacts").select(CONTACT_FIELDS).eq("id", contactId).eq("is_active", true).is("deleted_at", null).maybeSingle();
        if (error) throw error;
        if (!data) return failure("Contact not found", 404);
        return NextResponse.json({ contact: projectContact(data) });
      }
      case "create_case": {
        const title = stringValue(payload, "title");
        const tutorKind = typeof payload.tutorKind === "string" ? payload.tutorKind : "academy_tutor";
        if (!["swati", "academy_tutor"].includes(tutorKind)) return failure("Invalid tutor kind");
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
        const { data: created, error } = await supabase.from("hermes_scheduling_cases").insert({
          title,
          requested_by_contact_id: requestedByContactId,
          timezone: typeof payload.timezone === "string" ? payload.timezone.slice(0, 100) : null,
          origin_platform: mode === "imessage_admin" ? "imessage" : "whatsapp_cloud",
          origin_actor_kind: actorKind,
          tutor_kind: tutorKind,
        }).select("id, title, status, timezone, tutor_kind, created_at").single();
        if (error || !created) throw error ?? new Error("case_create_failed");
        const { error: participantError } = await supabase.from("hermes_case_participants").insert(normalized.map((item) => ({ case_id: created.id, contact_id: item.contactId, participant_role: item.participantRole })));
        if (participantError) { await supabase.from("hermes_scheduling_cases").delete().eq("id", created.id); throw participantError; }
        await audit("case_created", "scheduling_case", created.id, { participantCount: normalized.length });
        return NextResponse.json({ case: created }, { status: 201 });
      }
      case "get_case": {
        const caseId = stringValue(payload, "caseId", 80);
        if (!(await requireCaseMembership(caseId))) return rejectRequest("Contact is not a case participant", 403, "case_membership_denied");
        const { data: caseRecord, error } = await supabase.from("hermes_scheduling_cases").select("id, title, status, timezone, tutor_kind, workspace_state, proposed_times, resolution, human_takeover, created_at, updated_at").eq("id", caseId).maybeSingle();
        if (error) throw error;
        if (!caseRecord) return failure("Case not found", 404);
        const { data: participants, error: participantsError } = await supabase.from("hermes_case_participants").select("contact_id, participant_role, availability, response_status, contact:hermes_contacts(id, display_name, role, timezone, communication_policy, consent_status, is_active)").eq("case_id", caseId);
        if (participantsError) throw participantsError;
        return NextResponse.json({ case: caseRecord, participants: projectCaseParticipantsForActor(participants ?? [], actorKind, actorContact?.id ?? null) });
      }
      case "list_my_cases": {
        if (!actorContact) return rejectRequest("This action is only available to an academy contact", 403, "contact_required");
        const { data, error } = await supabase.from("hermes_case_participants").select("participant_role, response_status, availability, case:hermes_scheduling_cases(id, title, status, timezone, proposed_times, resolution, human_takeover, updated_at)").eq("contact_id", actorContact.id).order("updated_at", { referencedTable: "hermes_scheduling_cases", ascending: false }).limit(20);
        if (error) throw error;
        return NextResponse.json({ contact: projectContact(actorContact), cases: (data ?? []).map((item) => ({ participantRole: item.participant_role, responseStatus: item.response_status, availability: item.availability, case: Array.isArray(item.case) ? item.case[0] : item.case })).filter((item) => item.case) });
      }
      case "record_availability": {
        const caseId = stringValue(payload, "caseId", 80);
        const contactId = actorKind === "contact" ? actorContact!.id : stringValue(payload, "contactId", 80);
        if (!(await requireCaseMembership(caseId))) return rejectRequest("Contact is not a case participant", 403, "case_membership_denied");
        const availability = sanitizeAvailability(payload.availability);
        const { data: participant, error } = await supabase.from("hermes_case_participants").update({ availability, response_status: "responded" }).eq("case_id", caseId).eq("contact_id", contactId).select("id").maybeSingle();
        if (error) throw error;
        if (!participant) return rejectRequest("Contact is not a case participant", 403, "case_membership_denied");
        await audit("availability_recorded", "scheduling_case", caseId, { contactId, windowCount: availability.length });
        return NextResponse.json({ recorded: true, windowCount: availability.length });
      }
      case "request_reschedule": {
        const caseId = stringValue(payload, "caseId", 80);
        const reason = stringValue(payload, "reason", 500);
        if (!(await requireCaseMembership(caseId))) return rejectRequest("Contact is not a case participant", 403, "case_membership_denied");
        const { data: changed, error } = await supabase.from("hermes_scheduling_cases").update({ status: "needs_attention", human_takeover: true }).eq("id", caseId).neq("status", "cancelled").select("id").maybeSingle();
        if (error) throw error;
        if (!changed) return failure("Case is unavailable", 409);
        await audit("reschedule_requested", "scheduling_case", caseId, { reason });
        return NextResponse.json({ status: "needs_attention", humanTakeover: true });
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
        let notification = { status: "disabled" };
        if (process.env.HERMES_WHATSAPP_APPROVALS_ENABLED === "true") {
          notification = { status: "failed" };
          const adminNumber = process.env.HERMES_ADMIN_WHATSAPP_E164;
          const templateName = process.env.WHATSAPP_TEMPLATE_ADMIN_APPROVAL;
          const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
          const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
          if (adminNumber && templateName && phoneNumberId && accessToken) {
            try {
              let binding: { id: string; code: string } | null = null;
              for (let attempt = 0; attempt < 5 && !binding; attempt += 1) {
                const inserted = await supabase
                  .from("hermes_whatsapp_approval_bindings")
                  .insert({ approval_id: approval.id, code: generateApprovalCode(), expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() })
                  .select("id, code")
                  .maybeSingle();
                if (inserted.data) binding = inserted.data;
                else if (inserted.error?.code === "23505") {
                  const existing = await supabase.from("hermes_whatsapp_approval_bindings").select("id, code").eq("approval_id", approval.id).maybeSingle();
                  if (existing.data) binding = existing.data;
                } else break;
              }
              if (binding) {
                const graphPayload = buildApprovalTemplateMessage({
                  to: adminNumber,
                  templateName,
                  locale: process.env.WHATSAPP_TEMPLATE_LOCALE ?? "en_US",
                  code: binding.code,
                  approvalPayload: approval.payload,
                });
                const version = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v23.0";
                const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify(graphPayload),
                });
                const result = response.ok ? await response.json().catch(() => ({})) : {};
                const messageId = typeof result?.messages?.[0]?.id === "string" ? result.messages[0].id : null;
                await supabase.from("hermes_whatsapp_approval_bindings").update({
                  notification_status: response.ok && messageId ? "sent" : "failed",
                  notification_message_id: response.ok ? messageId : null,
                  updated_at: new Date().toISOString(),
                }).eq("id", binding.id);
                notification = { status: response.ok && messageId ? "sent" : "failed" };
              }
            } catch {
              notification = { status: "failed" };
            }
          }
          await audit("approval_notification", "scheduling_case", caseId, { approvalId: approval.id, channel: "whatsapp", status: notification.status });
        }
        return NextResponse.json({ approval: { id: approval.id, case_id: approval.case_id, action: approval.action, status: approval.status, requested_at: approval.requested_at, payload: approval.payload }, notification }, { status: 201 });
      }
      case "confirm_class": {
        const caseId = stringValue(payload, "caseId", 80);
        const approvalId = stringValue(payload, "approvalId", 80);
        const resolution = objectValue(payload.resolution ?? {});
        const { data: confirmedCase, error } = await supabase.rpc("confirm_hermes_class", {
          p_case_id: caseId,
          p_approval_id: approvalId,
          p_resolution: resolution,
          p_calendar_writes_enabled: process.env.HERMES_CALENDAR_WRITES_ENABLED === "true",
        });
        if (error?.message?.includes("calendar_writes_disabled")) return failure("Calendar writes are unavailable", 503);
        if (error || !confirmedCase) return failure("Approval is stale, consumed, or does not match this exact resolution", 409);
        await audit("class_confirmed", "scheduling_case", caseId, { approvalId });
        let calendarJob = null;
        if (confirmedCase.tutor_kind === "swati") {
          const { data: job, error: jobError } = await supabase
            .from("hermes_workspace_jobs")
            .select("id, status")
            .eq("case_id", caseId)
            .eq("job_type", "calendar_create_event")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (jobError || !job) throw jobError ?? new Error("calendar_job_missing");
          calendarJob = job;
        }
        return NextResponse.json({ status: confirmedCase.status, resolution: confirmedCase.resolution, calendarJob });
      }
      case "request_swati_freebusy": {
        if (process.env.HERMES_WORKSPACE_JOBS_ENABLED !== "true") return failure("Workspace jobs are unavailable", 503);
        const caseId = stringValue(payload, "caseId", 80);
        const freeBusyPayload = parseFreeBusyPayload({ windows: payload.windows, timezone: payload.timezone });
        const { data: caseRecord, error: caseError } = await supabase
          .from("hermes_scheduling_cases")
          .select("id, status")
          .eq("id", caseId)
          .maybeSingle();
        if (caseError) throw caseError;
        if (!caseRecord) return failure("Case not found", 404);
        if (["confirmed", "cancelled"].includes(caseRecord.status)) return failure("Case is unavailable", 409);
        const idempotencyKey = workspaceJobIdempotencyKey(caseId, freeBusyPayload);
        const payloadDigest = idempotencyKey.slice("freebusy:".length);
        let { data: job, error: jobError } = await supabase
          .from("hermes_workspace_jobs")
          .insert({ case_id: caseId, job_type: "calendar_freebusy", payload: freeBusyPayload, payload_digest: payloadDigest, idempotency_key: idempotencyKey })
          .select("id, status")
          .single();
        if (jobError?.code === "23505") {
          const existing = await supabase
            .from("hermes_workspace_jobs")
            .select("id, status")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          job = existing.data;
          jobError = existing.error;
        }
        if (jobError || !job) throw jobError ?? new Error("workspace_job_create_failed");
        const { error: stateError } = await supabase
          .from("hermes_scheduling_cases")
          .update({ workspace_state: job.status === "succeeded" ? "ready" : "pending" })
          .eq("id", caseId);
        if (stateError) throw stateError;
        await audit("workspace_job_requested", "scheduling_case", caseId, { jobId: job.id, jobType: "calendar_freebusy" });
        return NextResponse.json({ job: { id: job.id, status: job.status } }, { status: 202 });
      }
      case "get_workspace_job": {
        if (process.env.HERMES_WORKSPACE_JOBS_ENABLED !== "true") return failure("Workspace jobs are unavailable", 503);
        const jobId = stringValue(payload, "jobId", 80);
        const { data: job, error } = await supabase
          .from("hermes_workspace_jobs")
          .select("id, case_id, job_type, status, result, error_code, created_at, updated_at")
          .eq("id", jobId)
          .maybeSingle();
        if (error) throw error;
        if (!job) return failure("Workspace job not found", 404);
        return NextResponse.json({
          job: {
            id: job.id,
            caseId: job.case_id,
            jobType: job.job_type,
            status: job.status,
            result: job.result ? (job.job_type === "calendar_create_event" ? parseCalendarEventResult(job.result) : parseFreeBusyResult(job.result)) : null,
            errorCode: job.error_code,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
          },
        });
      }
      case "send_message": {
        const contactId = stringValue(payload, "contactId", 80);
        const intent = stringValue(payload, "intent", 40) as WhatsAppIntent;
        if (!["permission_request", "availability_request", "time_proposal", "class_confirmation", "reschedule_request", "class_reminder", "human_attention"].includes(intent)) return failure("Invalid intent");
        const idempotencyKey = stringValue(payload, "idempotencyKey", 128);
        const caseId = stringValue(payload, "caseId", 80);
        if (intent === "class_confirmation") {
          const { data: caseRecord, error: caseError } = await supabase
            .from("hermes_scheduling_cases")
            .select("id, status, tutor_kind, workspace_state")
            .eq("id", caseId)
            .maybeSingle();
          if (caseError) throw caseError;
          if (!caseRecord) return failure("Case not found", 404);
          if (caseRecord.status !== "confirmed") return failure("Class is not confirmed", 409);
          if (caseRecord.tutor_kind === "swati" && caseRecord.workspace_state !== "ready") {
            return failure("Swati's Calendar event is not ready", 409);
          }
        }
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
        if (!(await requireCaseMembership(caseId))) return rejectRequest("Contact is not a case participant", 403, "case_membership_denied");
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

export async function POST(request: Request) {
  return handleHermesToolPost(request, "whatsapp");
}
