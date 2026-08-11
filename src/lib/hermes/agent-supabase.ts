import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentActionDecision, AgentPolicyRepository } from "./agent-capability-types";
import type { AgentActionRow, AgentActionStore } from "./agent-actions";
import { getKittyReminderFacts } from "./kitty-class-service";

function decisionFromRow(row: Record<string, unknown>): AgentActionDecision {
  const kind = String(row.decision);
  const normalizedInput = row.normalized_input as Record<string, unknown> | null;
  const relevantVersions = row.relevant_versions as Record<string, string>;
  const reasonCode = String(row.public_reason_code ?? "approval_required");
  if (kind === "allowed" && normalizedInput) return { kind, normalizedInput, relevantVersions };
  if (kind === "needs_approval" && normalizedInput) return { kind, normalizedInput, relevantVersions, reasonCode };
  if (kind === "needs_clarification") return { kind, missingFields: Array.isArray(row.missing_fields) ? row.missing_fields.map(String) : [], reasonCode };
  return { kind: "denied", reasonCode: String(row.public_reason_code ?? "action_out_of_scope") };
}

function actionRow(row: Record<string, unknown>): AgentActionRow {
  const decision = decisionFromRow(row);
  return {
    id: String(row.id), actorKey: String(row.actor_key), clientRequestId: String(row.client_request_id),
    capabilityName: String(row.capability_name), capabilityVersion: Number(row.capability_version),
    inputDigest: String(row.input_digest), normalizedInput: row.normalized_input as Record<string, unknown> | null,
    relevantVersions: row.relevant_versions as Record<string, string>, policyVersion: String(row.policy_version),
    decision, tokenHash: row.evaluation_token_hash ? String(row.evaluation_token_hash) : null,
    issuedAt: row.evaluation_issued_at ? new Date(String(row.evaluation_issued_at)).getTime() : null,
    expiresAt: row.evaluation_expires_at ? new Date(String(row.evaluation_expires_at)).getTime() : null,
    executionStatus: row.execution_status as AgentActionRow["executionStatus"],
    result: row.result as Record<string, unknown> | null,
    errorCode: row.error_code ? String(row.error_code) : null,
  };
}

function dbRow(row: AgentActionRow, channel: string) {
  return {
    id: row.id, actor_key: row.actorKey, actor_type: row.actorKey.startsWith("contact:") ? "contact" : "admin",
    actor_contact_id: row.actorKey.startsWith("contact:") ? row.actorKey.slice("contact:".length) : null,
    channel, capability_name: row.capabilityName, capability_version: row.capabilityVersion,
    client_request_id: row.clientRequestId, input_digest: row.inputDigest, normalized_input: row.normalizedInput,
    relevant_versions: row.relevantVersions, policy_version: row.policyVersion, decision: row.decision.kind,
    public_reason_code: "reasonCode" in row.decision ? row.decision.reasonCode : null,
    missing_fields: "missingFields" in row.decision ? row.decision.missingFields : null,
    evaluation_token_hash: row.tokenHash,
    evaluation_issued_at: row.issuedAt === null ? null : new Date(row.issuedAt).toISOString(),
    evaluation_expires_at: row.expiresAt === null ? null : new Date(row.expiresAt).toISOString(),
    execution_status: row.executionStatus,
  };
}

export function createSupabaseAgentActionStore(client: SupabaseClient, channel: string): AgentActionStore {
  const select = "*";
  return {
    async findByActorRequest(actorKey, clientRequestId) {
      const { data, error } = await client.from("academy_agent_action_requests").select(select).eq("actor_key", actorKey).eq("client_request_id", clientRequestId).maybeSingle();
      if (error) throw new Error("action_store_unavailable");
      return data ? actionRow(data) : null;
    },
    async findById(id) {
      const { data, error } = await client.from("academy_agent_action_requests").select(select).eq("id", id).maybeSingle();
      if (error) throw new Error("action_store_unavailable");
      return data ? actionRow(data) : null;
    },
    async insert(row) {
      const { data, error } = await client.from("academy_agent_action_requests").insert(dbRow(row, channel)).select(select).single();
      if (error || !data) throw new Error(error?.code === "23505" ? "action_request_conflict" : "action_store_unavailable");
      return actionRow(data);
    },
    async claim(id) {
      const { data, error } = await client.from("academy_agent_action_requests").update({ execution_status: "executing", updated_at: new Date().toISOString() }).eq("id", id).eq("execution_status", "pending").select(select).maybeSingle();
      if (error) throw new Error("action_store_unavailable");
      return data ? actionRow(data) : null;
    },
    async complete(id, result) {
      const { data, error } = await client.from("academy_agent_action_requests").update({ execution_status: "completed", result, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("execution_status", "executing").select(select).single();
      if (error || !data) throw new Error("action_store_unavailable");
      return actionRow(data);
    },
    async fail(id, errorCode) {
      const { data, error } = await client.from("academy_agent_action_requests").update({ execution_status: "failed", error_code: errorCode, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("execution_status", "executing").select(select).single();
      if (error || !data) throw new Error("action_store_unavailable");
      return actionRow(data);
    },
  };
}

export function createSupabaseAgentPolicyRepository(client: SupabaseClient): AgentPolicyRepository {
  return {
    async loadContact(contactId) {
      const { data, error } = await client.from("hermes_contacts").select("id, role, consent_status, communication_policy, is_active, updated_at").eq("id", contactId).is("deleted_at", null).maybeSingle();
      if (error) throw new Error("policy_repository_unavailable");
      return data ? { id: data.id, role: data.role, consentStatus: data.consent_status, communicationPolicy: data.communication_policy, isActive: data.is_active, updatedAt: data.updated_at } : null;
    },
    async loadRelationships(contactId) {
      const { data, error } = await client.from("hermes_contact_relationships").select("id, source_contact_id, target_contact_id, relationship_type, is_active, effective_start, effective_end, updated_at").or(`source_contact_id.eq.${contactId},target_contact_id.eq.${contactId}`);
      if (error) throw new Error("policy_repository_unavailable");
      const today = new Date().toISOString().slice(0, 10);
      return (data ?? []).map((row) => {
        const active = row.is_active && (!row.effective_start || row.effective_start <= today) && (!row.effective_end || row.effective_end >= today);
        if (row.relationship_type === "teacher") return { id: row.id, teacherContactId: row.source_contact_id, studentContactId: row.target_contact_id, status: active ? "active" : "inactive", updatedAt: row.updated_at };
        if (row.relationship_type === "parent_guardian") return { id: row.id, contactId: row.source_contact_id, representedStudentId: row.target_contact_id, status: active ? "active" : "inactive", updatedAt: row.updated_at };
        return { id: row.id, status: "inactive", updatedAt: row.updated_at };
      });
    },
    async loadOccurrence(occurrenceId) {
      try {
        const facts = await getKittyReminderFacts(client, occurrenceId);
        return {
          id: facts.occurrence.id, version: facts.occurrence.version, timezone: facts.occurrence.timezone,
          status: facts.occurrence.status, teacherContactId: facts.teacher.id,
          studentContactIds: facts.students.map((student) => student.id),
          participantContactIds: facts.recipients.map((recipient) => recipient.id),
        };
      } catch {
        return null;
      }
    },
  };
}
