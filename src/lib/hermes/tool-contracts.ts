type JsonObject = Record<string, unknown>;

const TOP_LEVEL_ALIASES: Record<string, string> = {
  approval_id: "approvalId",
  approval_payload: "approvalPayload",
  body_parameters: "bodyParameters",
  case_id: "caseId",
  contact_id: "contactId",
  cycle_id: "cycleId",
  family_invoice_id: "familyInvoiceId",
  idempotency_key: "idempotencyKey",
  job_id: "jobId",
  lesson_cycle_id: "lessonCycleId",
  period_start: "periodStart",
  proposed_times: "proposedTimes",
  relationship_type: "relationshipType",
  report_id: "reportId",
  requested_by_contact_id: "requestedByContactId",
  settlement_cycle_id: "settlementCycleId",
  source_contact_id: "sourceContactId",
  student_contact_id: "studentContactId",
  template_data: "templateData",
  target_contact_id: "targetContactId",
  tutor_contact_id: "tutorContactId",
  tutor_contact_ids: "tutorContactIds",
  tutor_kind: "tutorKind",
};

const PARTICIPANT_ALIASES: Record<string, string> = {
  contact_id: "contactId",
  participant_role: "participantRole",
};

const LESSON_ALIASES: Record<string, string> = {
  duration_minutes: "durationMinutes",
  lesson_date: "lessonDate",
  reported_student_name: "reportedStudentName",
  student_contact_id: "studentContactId",
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
  if ((action === "submit_lesson_report" || action === "import_swati_lessons") && Array.isArray(normalized.lessons)) {
    normalized.lessons = normalized.lessons.map((entry) => (
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeAliases(entry as JsonObject, LESSON_ALIASES)
        : entry
    ));
  }
  return normalized;
}
