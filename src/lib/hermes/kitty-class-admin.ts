export type KittyAdminAttentionIssue = {
  id: string;
  occurrenceId: string | null;
  seriesId: string | null;
  kind: "expired_request" | "rejected_proposal" | "ambiguous_scope" | "missing_decision_maker";
};

type AttentionOccurrence = { id: string; series_id: string | null; status: string };
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
