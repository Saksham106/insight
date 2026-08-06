export type KittyAdminAttentionIssue = {
  id: string;
  occurrenceId: string | null;
  seriesId: string | null;
  kind: "expired_request" | "rejected_proposal" | "ambiguous_scope" | "missing_decision_maker";
};

type AttentionOccurrence = { id: string; series_id: string | null; status: string };
type DeliveryIssue = { occurrence_id: string; status: string };

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
