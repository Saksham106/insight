/**
 * What is actually happening on a scheduling case.
 *
 * The Scheduling tab loaded only case-level columns, so "who is waiting on
 * whom" — the thing the tab claims to answer — was never computed. Recording
 * availability updated a participant row and changed nothing visible.
 *
 * This projects the minimum an administrator needs: the participants, their
 * response state, and a single derived sentence naming who or what the case is
 * blocked on. Raw availability payloads are counted, never surfaced.
 */

export type CaseStatus =
  | "draft"
  | "collecting_availability"
  | "proposing"
  | "awaiting_approval"
  | "confirmed"
  | "cancelled"
  | "needs_attention";

/** Cases that are done. They must never appear in Active Scheduling. */
export const RESOLVED_CASE_STATUSES: readonly CaseStatus[] = ["confirmed", "cancelled"];

export interface SchedulingCase {
  id: string;
  title: string;
  status: string;
  human_takeover: boolean;
  proposed_times?: unknown[] | null;
  resolution?: unknown;
  updated_at: string;
}

export interface SchedulingParticipant {
  id: string;
  case_id: string;
  contact_id: string;
  participant_role: string;
  response_status: string;
  availability?: unknown[] | null;
  updated_at?: string;
  contact?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
}

export interface ParticipantView {
  id: string;
  name: string;
  role: string;
  responseStatus: string;
  hasAvailability: boolean;
  windowCount: number;
}

export interface SchedulingCaseView {
  id: string;
  title: string;
  status: string;
  humanTakeover: boolean;
  participants: ParticipantView[];
  proposedTimeCount: number;
  awaitingApproval: boolean;
  /** The one sentence that says what the case is blocked on. */
  nextAction: string;
  lastUpdatedAt: string;
}

function contactName(relation: SchedulingParticipant["contact"]): string {
  const record = Array.isArray(relation) ? relation[0] : relation;
  return record?.display_name?.trim() || "a removed contact";
}

/** "Priya", "Priya and Ravi", "Priya, Ravi and Meera". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function windowCount(availability: unknown): number {
  return Array.isArray(availability) ? availability.length : 0;
}

export function projectParticipant(participant: SchedulingParticipant): ParticipantView {
  const count = windowCount(participant.availability);
  return {
    id: participant.id,
    name: contactName(participant.contact),
    role: participant.participant_role,
    responseStatus: participant.response_status,
    hasAvailability: count > 0,
    windowCount: count,
  };
}

export function deriveNextAction({
  status,
  humanTakeover,
  participants,
  awaitingApproval,
}: {
  status: string;
  humanTakeover: boolean;
  participants: readonly ParticipantView[];
  awaitingApproval: boolean;
}): string {
  // A person has taken the case off Kitty; nothing else matters until they act.
  if (humanTakeover) return "Swati needs to take over";
  if (status === "needs_attention") return "Swati needs to take over";
  if (status === "confirmed") return "Confirmed";
  if (status === "cancelled") return "Closed";
  if (awaitingApproval || status === "awaiting_approval") return "Waiting on Swati's approval";
  if (status === "proposing") return "Waiting on Kitty to send the proposal";

  const outstanding = participants.filter(
    (participant) => participant.responseStatus === "pending" || participant.responseStatus === "contacted",
  );
  if (outstanding.length > 0) return `Waiting on ${joinNames(outstanding.map((p) => p.name))}`;

  const declined = participants.filter((participant) => participant.responseStatus === "declined");
  if (declined.length > 0) return `${joinNames(declined.map((p) => p.name))} declined — Swati needs to decide`;

  const failed = participants.filter((participant) => participant.responseStatus === "failed");
  if (failed.length > 0) return `Could not reach ${joinNames(failed.map((p) => p.name))}`;

  // Everyone answered. If anybody actually gave times, Kitty can propose.
  if (participants.length > 0 && participants.some((participant) => participant.hasAvailability)) {
    return "Ready for Kitty to propose times";
  }
  if (participants.length === 0) return "No participants yet — Swati should review";
  return "Everyone replied without availability — Swati needs to decide";
}

export function projectSchedulingCase({
  case: item,
  participants,
  awaitingApproval = false,
}: {
  case: SchedulingCase;
  participants: readonly SchedulingParticipant[];
  awaitingApproval?: boolean;
}): SchedulingCaseView {
  const mine = participants
    .filter((participant) => participant.case_id === item.id)
    .map(projectParticipant);
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    humanTakeover: item.human_takeover,
    participants: mine,
    proposedTimeCount: Array.isArray(item.proposed_times) ? item.proposed_times.length : 0,
    awaitingApproval,
    nextAction: deriveNextAction({
      status: item.status,
      humanTakeover: item.human_takeover,
      participants: mine,
      awaitingApproval,
    }),
    lastUpdatedAt: item.updated_at,
  };
}

/** Active Scheduling is open coordination only. */
export function projectActiveSchedulingCases({
  cases,
  participants,
  approvalCaseIds = [],
}: {
  cases: readonly SchedulingCase[];
  participants: readonly SchedulingParticipant[];
  approvalCaseIds?: readonly string[];
}): SchedulingCaseView[] {
  const awaiting = new Set(approvalCaseIds);
  return cases
    .filter((item) => !RESOLVED_CASE_STATUSES.includes(item.status as CaseStatus))
    .map((item) =>
      projectSchedulingCase({
        case: item,
        participants,
        awaitingApproval: awaiting.has(item.id),
      }),
    );
}
