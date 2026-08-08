export type KittyAdminAttentionIssue = {
  id: string;
  occurrenceId: string | null;
  seriesId: string | null;
  kind: "expired_request" | "rejected_proposal" | "ambiguous_scope" | "missing_decision_maker";
};

type AttentionOccurrence = { id: string; series_id: string | null; status: string };
type DatedOccurrence = AttentionOccurrence & { ends_at: string; starts_at?: string };
type DeliveryIssue = { occurrence_id: string; status: string };

export type KittyEnrollmentDraft = { id: number; parentIds: number[] };
export type KittyEnrollmentDraftAction =
  | { type: "add_enrollment"; id: number }
  | { type: "remove_enrollment"; id: number }
  | { type: "add_parent"; enrollmentId: number; parentId: number }
  | { type: "remove_parent"; enrollmentId: number; parentId: number };

const WORKFLOW_LABELS: Record<KittyAdminAttentionIssue["kind"], string> = {
  expired_request: "Expired request",
  rejected_proposal: "Rejected proposal",
  ambiguous_scope: "Ambiguous scope",
  missing_decision_maker: "Missing reschedule decision-maker",
};

export function kittyClassAttentionReasons(
  occurrence: AttentionOccurrence,
  deliveryIssues: readonly DeliveryIssue[],
  workflowIssues: readonly KittyAdminAttentionIssue[],
) {
  const reasons: string[] = [];
  if (occurrence.status === "change_requested") reasons.push("Pending class change");
  if (deliveryIssues.some((issue) => issue.occurrence_id === occurrence.id && issue.status === "failed")) {
    reasons.push("Failed delivery");
  }
  if (deliveryIssues.some((issue) => issue.occurrence_id === occurrence.id && issue.status === "blocked")) {
    reasons.push("Delivery reconciliation required");
  }
  const relevant = workflowIssues.filter((issue) =>
    issue.occurrenceId === occurrence.id
      || Boolean(occurrence.series_id && issue.seriesId === occurrence.series_id),
  );
  for (const kind of ["expired_request", "rejected_proposal", "ambiguous_scope", "missing_decision_maker"] as const) {
    if (relevant.some((issue) => issue.kind === kind)) reasons.push(WORKFLOW_LABELS[kind]);
  }
  return reasons;
}

export function filterKittyAttentionClasses<T extends AttentionOccurrence>(
  occurrences: readonly T[],
  deliveryIssues: readonly DeliveryIssue[],
  workflowIssues: readonly KittyAdminAttentionIssue[],
) {
  return occurrences.filter((occurrence) =>
    kittyClassAttentionReasons(occurrence, deliveryIssues, workflowIssues).length > 0,
  );
}

/**
 * Upcoming answers "what is next", not "list the whole generated calendar".
 * Two weekly series already generate 39 future occurrences in production, which
 * buries the next class. Five is the whole simplification — occurrences are not
 * collapsed by series, because two sittings of one weekly class are two
 * genuinely separate events.
 */
export const KITTY_UPCOMING_CLASS_LIMIT = 5;

export function collectKittyAttentionOccurrenceIds({
  workflowIssues,
  deliveryIssues,
  changeRequestedOccurrences,
  excludeIds = [],
}: {
  workflowIssues: readonly Pick<KittyAdminAttentionIssue, "occurrenceId">[];
  deliveryIssues: readonly Pick<DeliveryIssue, "occurrence_id">[];
  changeRequestedOccurrences: readonly { id: string }[];
  excludeIds?: readonly string[];
}) {
  const excluded = new Set(excludeIds);
  const ids = [
    ...workflowIssues.flatMap((issue) => issue.occurrenceId ? [issue.occurrenceId] : []),
    ...deliveryIssues.map((issue) => issue.occurrence_id),
    ...changeRequestedOccurrences.map((occurrence) => occurrence.id),
  ];
  return [...new Set(ids)].filter((id) => !excluded.has(id));
}

/** Chronological key. Real rows always carry starts_at; ends_at is a fallback. */
function occurrenceTime(occurrence: DatedOccurrence) {
  return new Date(occurrence.starts_at ?? occurrence.ends_at).getTime();
}

/** Keeps the input order for rows whose timestamps cannot be compared. */
function byTime(direction: "asc" | "desc") {
  return (left: DatedOccurrence, right: DatedOccurrence) => {
    const a = occurrenceTime(left);
    const b = occurrenceTime(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return direction === "asc" ? a - b : b - a;
  };
}

export function filterKittyClassesForView<T extends DatedOccurrence>(
  occurrences: readonly T[],
  view: "upcoming" | "attention" | "history" | "recurring",
  referenceAt = new Date().toISOString(),
) {
  // Attention is deliberately uncapped and keeps past rows: an occurrence
  // needing a decision must be reachable even when it is not one of the five.
  if (view === "attention") return [...occurrences];
  if (view === "history") {
    return occurrences
      .filter((occurrence) => ["completed", "cancelled", "rescheduled"].includes(occurrence.status))
      .sort(byTime("desc"));
  }
  if (view === "recurring") return [];
  const referenceTime = new Date(referenceAt).getTime();
  if (!Number.isFinite(referenceTime)) throw new Error("invalid_reference_time");
  // Stale and non-eligible rows are dropped *before* the limit, so five past
  // occurrences can never consume the whole list and leave Upcoming empty.
  return occurrences
    .filter((occurrence) =>
      ["scheduled", "change_requested"].includes(occurrence.status)
        && new Date(occurrence.ends_at).getTime() >= referenceTime,
    )
    .sort(byTime("asc"))
    .slice(0, KITTY_UPCOMING_CLASS_LIMIT);
}

export async function loadKittyAdminAttentionIssues(client: SupabaseClient, limit = 200) {
  const { data, error } = await client.rpc("get_kitty_class_admin_attention_issues", {
    p_reference_at: new Date().toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error("kitty_attention_unavailable");
  return (data ?? []).map((row: Record<string, unknown>): KittyAdminAttentionIssue => ({
    id: String(row.source_id),
    occurrenceId: row.occurrence_id ? String(row.occurrence_id) : null,
    seriesId: row.series_id ? String(row.series_id) : null,
    kind: String(row.kind) as KittyAdminAttentionIssue["kind"],
  }));
}

export function reduceKittyEnrollmentDrafts(
  current: KittyEnrollmentDraft[],
  action: KittyEnrollmentDraftAction,
) {
  if (action.type === "add_enrollment") return [...current, { id: action.id, parentIds: [] }];
  if (action.type === "remove_enrollment") return current.filter((item) => item.id !== action.id);
  return current.map((item) => {
    if (item.id !== action.enrollmentId) return item;
    return action.type === "add_parent"
      ? { ...item, parentIds: [...item.parentIds, action.parentId] }
      : { ...item, parentIds: item.parentIds.filter((id) => id !== action.parentId) };
  });
}

export function normalizeKittyEnrollmentMutationTiming(input: {
  action: "add_enrollment" | "end_enrollment";
  seriesId: string | null;
  localDate: string;
  scope: string;
  effectiveDate: string;
}) {
  if (!input.seriesId) {
    if (input.scope !== "occurrence") throw new Error("invalid_scope");
    return { scope: "occurrence" as const, effectiveDate: input.localDate };
  }
  if (input.action === "end_enrollment" && input.scope !== "this_and_future") throw new Error("invalid_scope");
  if (input.scope !== "occurrence" && input.scope !== "this_and_future") throw new Error("invalid_scope");
  return {
    scope: input.scope,
    effectiveDate: input.scope === "occurrence" ? input.localDate : input.effectiveDate,
  } as const;
}

export function canRetryKittyNotification(status: string) {
  return status === "failed";
}

export function shouldLoadKittyOccurrenceDetail(input: {
  open: boolean;
  hasDetail: boolean;
  isLoading: boolean;
  force?: boolean;
}) {
  return input.open && (input.force || !input.hasDetail) && !input.isLoading;
}
import type { SupabaseClient } from "@supabase/supabase-js";
