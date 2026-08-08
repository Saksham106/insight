/**
 * Closing scheduling cases that were only ever message transport.
 *
 * Kitty was told to open a scheduling case before sending a class reminder, so
 * production carries cases stuck in collecting_availability that never had a
 * coordination workflow behind them — no participant was contacted, nobody gave
 * availability, no time was proposed. They sit in Active Scheduling forever.
 *
 * This decides which of those are safe to close. It is deliberately reluctant:
 * every condition must hold, and anything ambiguous is left alone for a person
 * to look at. Nothing is ever deleted — a reconciled case is marked cancelled
 * with a bounded reason and an audit event.
 */

/** Audit events that mean a real scheduling workflow happened. */
const PROGRESS_EVENTS = new Set([
  "availability_recorded",
  "availability_requested",
  "times_proposed",
  "approval_requested",
  "approval_decided",
  "class_confirmed",
  "reschedule_requested",
  "human_escalation",
  "case_status_changed",
]);

/** Message intents that are one-way transport rather than coordination. */
const TRANSPORT_INTENTS = new Set(["class_reminder", "human_attention"]);

export const RECONCILIATION_REASON_LIMIT = 200;

export interface ReconcilableCase {
  id: string;
  status: string;
  proposed_times?: unknown[] | null;
  resolution?: unknown;
  human_takeover?: boolean;
}

export interface ReconcilableParticipant {
  case_id: string;
  response_status: string;
  availability?: unknown[] | null;
}

export interface ReconcilableAuditEvent {
  entity_id: string | null;
  event_type: string;
}

export interface ReconcilableMessage {
  case_id: string | null;
  intent: string | null;
}

export interface ReconcilableApproval {
  case_id: string | null;
  status: string;
}

export type ReconciliationVerdict =
  | { reconcilable: true; reason: string }
  | { reconcilable: false; blockedBy: string };

/**
 * Whether one case is a phantom that can be closed.
 *
 * Every check is a reason to refuse. A case is only reconcilable when nothing
 * at all happened on it beyond being created and carrying a reminder.
 */
export function assessCaseForReconciliation({
  case: item,
  participants,
  auditEvents,
  messages,
  approvals,
}: {
  case: ReconcilableCase;
  participants: readonly ReconcilableParticipant[];
  auditEvents: readonly ReconcilableAuditEvent[];
  messages: readonly ReconcilableMessage[];
  approvals: readonly ReconcilableApproval[];
}): ReconciliationVerdict {
  if (item.status !== "collecting_availability") {
    return { reconcilable: false, blockedBy: "status_not_collecting_availability" };
  }
  if (item.human_takeover) return { reconcilable: false, blockedBy: "human_takeover" };
  if (Array.isArray(item.proposed_times) && item.proposed_times.length > 0) {
    return { reconcilable: false, blockedBy: "has_proposed_times" };
  }
  if (item.resolution !== null && item.resolution !== undefined) {
    return { reconcilable: false, blockedBy: "has_resolution" };
  }

  const mine = participants.filter((participant) => participant.case_id === item.id);
  for (const participant of mine) {
    if (Array.isArray(participant.availability) && participant.availability.length > 0) {
      return { reconcilable: false, blockedBy: "participant_has_availability" };
    }
    if (participant.response_status !== "pending") {
      return { reconcilable: false, blockedBy: `participant_${participant.response_status}` };
    }
  }

  if (approvals.some((approval) => approval.case_id === item.id)) {
    return { reconcilable: false, blockedBy: "has_approval" };
  }

  const events = auditEvents.filter((event) => event.entity_id === item.id);
  if (events.some((event) => PROGRESS_EVENTS.has(event.event_type))) {
    return { reconcilable: false, blockedBy: "audit_shows_scheduling_progress" };
  }

  const caseMessages = messages.filter((message) => message.case_id === item.id);
  // An unknown intent is not assumed to be transport.
  if (caseMessages.some((message) => !message.intent || !TRANSPORT_INTENTS.has(message.intent))) {
    return { reconcilable: false, blockedBy: "has_coordination_message" };
  }

  const reason = caseMessages.length
    ? "Closed by reconciliation: only carried class reminder or human attention messages, with no scheduling activity."
    : "Closed by reconciliation: no participants were contacted and no scheduling activity was recorded.";
  return { reconcilable: true, reason: reason.slice(0, RECONCILIATION_REASON_LIMIT) };
}

/**
 * Plans the reconciliation for a batch. Returns what would change and why each
 * skipped case was left alone, so the plan can be reviewed before anything is
 * written. Idempotent: an already-cancelled case is simply not reconcilable.
 */
export function planCaseReconciliation(input: {
  cases: readonly ReconcilableCase[];
  participants: readonly ReconcilableParticipant[];
  auditEvents: readonly ReconcilableAuditEvent[];
  messages: readonly ReconcilableMessage[];
  approvals: readonly ReconcilableApproval[];
}): {
  close: Array<{ id: string; reason: string }>;
  skip: Array<{ id: string; blockedBy: string }>;
} {
  const close: Array<{ id: string; reason: string }> = [];
  const skip: Array<{ id: string; blockedBy: string }> = [];
  for (const item of input.cases) {
    const verdict = assessCaseForReconciliation({ ...input, case: item });
    if (verdict.reconcilable) close.push({ id: item.id, reason: verdict.reason });
    else skip.push({ id: item.id, blockedBy: verdict.blockedBy });
  }
  return { close, skip };
}
