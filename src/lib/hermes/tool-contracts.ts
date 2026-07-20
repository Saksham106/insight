type JsonObject = Record<string, unknown>;

const TOP_LEVEL_ALIASES: Record<string, string> = {
  approval_id: "approvalId",
  approval_payload: "approvalPayload",
  body_parameters: "bodyParameters",
  case_id: "caseId",
  contact_id: "contactId",
  family_invoice_id: "familyInvoiceId",
  idempotency_key: "idempotencyKey",
  job_id: "jobId",
  proposed_times: "proposedTimes",
  requested_by_contact_id: "requestedByContactId",
  settlement_cycle_id: "settlementCycleId",
  template_data: "templateData",
  tutor_kind: "tutorKind",
};

const PARTICIPANT_ALIASES: Record<string, string> = {
  contact_id: "contactId",
  participant_role: "participantRole",
};

function normalizeAliases(payload: JsonObject, aliases: Record<string, string>) {
  const normalized = { ...payload };
  for (const [legacy, canonical] of Object.entries(aliases)) {
    if (normalized[canonical] === undefined && normalized[legacy] !== undefined) normalized[canonical] = normalized[legacy];
    delete normalized[legacy];
  }
  return normalized;
}

export function normalizeToolPayload(action: string, payload: JsonObject): JsonObject {
  const normalized = normalizeAliases(payload, TOP_LEVEL_ALIASES);
  if (action === "create_case" && Array.isArray(normalized.participants)) {
    normalized.participants = normalized.participants.map((entry) => (
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeAliases(entry as JsonObject, PARTICIPANT_ALIASES)
        : entry
    ));
  }
  return normalized;
}
