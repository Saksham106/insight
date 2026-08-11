import { getCapability } from "./agent-capabilities";
import type {
  AgentActionDecision,
  AgentEvaluationContext,
} from "./agent-capability-types";

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string") return String(record[key]);
  }
  return "";
}

function booleanValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return Boolean(record[key]);
  }
  return false;
}

function listValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(String);
  }
  return [];
}

function versionValue(record: Record<string, unknown> | null) {
  const version = Number(record?.version ?? 0);
  return Number.isFinite(version) ? String(version) : "0";
}

function activeRelationship(record: Record<string, unknown>) {
  return !record.status || record.status === "active";
}

function connectsTeacherStudent(record: Record<string, unknown>, teacherId: string, studentId: string) {
  return activeRelationship(record)
    && stringValue(record, "teacherContactId", "teacher_contact_id") === teacherId
    && stringValue(record, "studentContactId", "student_contact_id") === studentId;
}

function representsStudent(record: Record<string, unknown>, parentId: string, studentId: string) {
  return activeRelationship(record)
    && stringValue(record, "contactId", "contact_id", "parentContactId", "parent_contact_id") === parentId
    && stringValue(record, "representedStudentId", "represented_student_id", "studentContactId", "student_contact_id") === studentId;
}

function missingRequiredFields(capabilityName: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const value = input as Record<string, unknown>;
  const required: Record<string, string[]> = {
    "class.one_off.create": ["title", "timezone", "startsAt", "endsAt", "localDate", "studentContactIds"],
    "class.reminder.send": ["occurrenceId", "recipientId"],
    "class.attendance.record": ["occurrenceId", "enrollmentHandle", "selectionToken", "status"],
    "class.reschedule.request": ["occurrenceId", "selectionToken", "scope"],
    "routine.manage": ["operation"],
  };
  return (required[capabilityName] ?? []).filter((key) => value[key] === undefined || value[key] === null || value[key] === "");
}

function allowed(normalizedInput: Record<string, unknown>, relevantVersions: Record<string, string>): AgentActionDecision {
  return { kind: "allowed", normalizedInput, relevantVersions };
}

async function evaluateOneOff(
  context: AgentEvaluationContext,
  normalizedInput: Record<string, unknown>,
  actorContact: Record<string, unknown>,
): Promise<AgentActionDecision> {
  if (context.actor.kind !== "contact" || context.actor.role !== "teacher") {
    return { kind: "needs_approval", normalizedInput, relevantVersions: {}, reasonCode: "approval_required" } as AgentActionDecision;
  }
  const actorContactId = context.actor.contactId;
  const requestedTeacher = String(normalizedInput.teacherContactId ?? actorContactId);
  if (requestedTeacher !== actorContactId) return { kind: "denied", reasonCode: "relationship_required" };
  const relationships = await context.repository.loadRelationships(actorContactId);
  const studentIds = normalizedInput.studentContactIds as string[];
  if (studentIds.some((studentId) => !relationships.some((item) => connectsTeacherStudent(item, actorContactId, studentId)))) {
    return { kind: "denied", reasonCode: "relationship_required" };
  }
  return allowed({ ...normalizedInput, teacherContactId: actorContactId }, {
    actor: versionValue(actorContact),
    relationships: relationships.filter(activeRelationship).map(versionValue).sort().join(","),
  });
}

async function evaluateOccurrenceAction(
  context: AgentEvaluationContext,
  normalizedInput: Record<string, unknown>,
  actorContact: Record<string, unknown>,
): Promise<AgentActionDecision> {
  const occurrence = await context.repository.loadOccurrence(String(normalizedInput.occurrenceId));
  if (!occurrence || !["scheduled", "change_requested"].includes(stringValue(occurrence, "status"))) {
    return { kind: "needs_clarification", missingFields: ["occurrenceId"], reasonCode: "occurrence_unavailable" } as AgentActionDecision;
  }
  const participants = listValue(occurrence, "participantContactIds", "participant_contact_ids");
  const students = listValue(occurrence, "studentContactIds", "student_contact_ids");
  const teacherId = stringValue(occurrence, "teacherContactId", "teacher_contact_id");
  const actorId = context.actor.kind === "contact" ? context.actor.contactId : "";
  const versions = { actor: versionValue(actorContact), occurrence: versionValue(occurrence) };

  if (context.actor.kind === "admin") return allowed(normalizedInput, versions);
  if (!participants.includes(actorId)) return { kind: "denied", reasonCode: "relationship_required" };

  if (context.capabilityName === "class.reminder.send") {
    const recipientId = String(normalizedInput.recipientId);
    if (!participants.includes(recipientId)) return { kind: "denied", reasonCode: "relationship_required" };
    if (context.actor.role === "teacher" && (actorId !== teacherId || (!students.includes(recipientId) && recipientId !== actorId))) {
      return { kind: "denied", reasonCode: "relationship_required" };
    }
    if (context.actor.role !== "teacher" && recipientId !== actorId) return { kind: "denied", reasonCode: "relationship_required" };
    const recipient = await context.repository.loadContact(recipientId);
    if (!recipient || !booleanValue(recipient, "isActive", "is_active")) return { kind: "denied", reasonCode: "communication_blocked" };
    if (["opted_out", "paused", "guardian_only"].includes(stringValue(recipient, "communicationPolicy", "communication_policy"))) {
      return { kind: "denied", reasonCode: "communication_blocked" };
    }
    return allowed(normalizedInput, { ...versions, recipient: versionValue(recipient) });
  }

  if (context.capabilityName === "class.reschedule.request") {
    if (context.actor.role === "teacher" || context.actor.role === "student") return allowed(normalizedInput, versions);
    if (context.actor.role === "parent") {
      const relationships = await context.repository.loadRelationships(actorId);
      if (students.some((studentId) => relationships.some((item) => representsStudent(item, actorId, studentId)))) {
        return allowed(normalizedInput, { ...versions, relationships: relationships.map(versionValue).sort().join(",") });
      }
    }
    return { kind: "denied", reasonCode: "relationship_required" };
  }

  return allowed(normalizedInput, versions);
}

export async function evaluateAgentAction(context: AgentEvaluationContext): Promise<AgentActionDecision> {
  let capability;
  try {
    capability = getCapability(context.capabilityName, context.capabilityVersion);
  } catch {
    return { kind: "denied", reasonCode: "action_out_of_scope" };
  }
  if (!capability.allowedActorKinds.includes(context.actor.kind)) return { kind: "denied", reasonCode: "action_out_of_scope" };

  const missingFields = missingRequiredFields(context.capabilityName, context.proposedInput);
  if (missingFields.length) return { kind: "needs_clarification", missingFields, reasonCode: "missing_required_fields" };

  let normalizedInput: Record<string, unknown>;
  try {
    normalizedInput = capability.normalize(context.proposedInput);
  } catch {
    return { kind: "denied", reasonCode: "invalid_action" };
  }

  if (context.actor.kind === "admin") return allowed(normalizedInput, { policy: "1" });
  const actorContact = await context.repository.loadContact(context.actor.contactId);
  if (!actorContact || !booleanValue(actorContact, "isActive", "is_active") || stringValue(actorContact, "role") !== context.actor.role) {
    return { kind: "denied", reasonCode: "relationship_required" };
  }
  if (stringValue(actorContact, "consentStatus", "consent_status") !== "attested"
    || ["opted_out", "paused"].includes(stringValue(actorContact, "communicationPolicy", "communication_policy"))) {
    return { kind: "denied", reasonCode: "communication_blocked" };
  }

  if (context.capabilityName === "class.one_off.create") {
    return evaluateOneOff(context, normalizedInput, actorContact);
  }
  if (["class.reminder.send", "class.reschedule.request", "class.attendance.record"].includes(context.capabilityName)) {
    return evaluateOccurrenceAction(context, normalizedInput, actorContact);
  }
  return { kind: "denied", reasonCode: "action_out_of_scope" };
}
