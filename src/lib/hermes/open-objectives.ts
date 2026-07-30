const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;

export interface LessonObjectiveRecord {
  id: string;
  status: string;
  periodStart: string;
  cycleStatus: string;
  reports: Array<{
    id: string;
    revision: number;
    status: string;
    submittedAt: string;
  }>;
}

export interface PaymentObjectiveRecord {
  id: string;
  status: string;
  periodStart: string;
}

export type OpenObjective =
  | {
      kind: "lesson_report";
      entityId: string;
      periodStart: string;
      stage: "awaiting_report" | "awaiting_confirmation";
    }
  | {
      kind: "family_payment";
      entityId: string;
      periodStart: string;
      stage: "awaiting_payment";
      invoiceReference: string;
    };

const PRIORITY = {
  awaiting_confirmation: 0,
  awaiting_report: 1,
  awaiting_payment: 2,
} as const;

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function uuid(input: unknown): string | null {
  return typeof input === "string" && UUID_PATTERN.test(input) ? input.toLowerCase() : null;
}

function monthStart(input: unknown): string | null {
  if (typeof input !== "string" || !MONTH_PATTERN.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : null;
}

function isoTimestamp(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function lessonObjective(input: unknown): OpenObjective | null {
  if (!isRecord(input)) return null;
  const collectionId = uuid(input.id);
  const periodStart = monthStart(input.periodStart);
  if (!collectionId || !periodStart || input.cycleStatus === "confirmed") return null;

  if (input.status === "requested" || input.status === "awaiting_reply" || input.status === "needs_attention") {
    return {
      kind: "lesson_report",
      entityId: collectionId,
      periodStart,
      stage: "awaiting_report",
    };
  }

  if (input.status !== "awaiting_teacher_confirmation" || !Array.isArray(input.reports)) return null;
  const report = input.reports
    .flatMap((candidate) => {
      if (!isRecord(candidate) || candidate.status !== "awaiting_teacher_confirmation") return [];
      const id = uuid(candidate.id);
      const submittedAt = isoTimestamp(candidate.submittedAt);
      if (!id || !Number.isSafeInteger(candidate.revision) || Number(candidate.revision) < 1 || !submittedAt) return [];
      return [{ id, revision: Number(candidate.revision) }];
    })
    .sort((left, right) => right.revision - left.revision || left.id.localeCompare(right.id))[0];
  if (!report) return null;
  return {
    kind: "lesson_report",
    entityId: report.id,
    periodStart,
    stage: "awaiting_confirmation",
  };
}

function paymentObjective(input: unknown): OpenObjective | null {
  if (!isRecord(input) || input.status !== "sent") return null;
  const invoiceId = uuid(input.id);
  const periodStart = monthStart(input.periodStart);
  if (!invoiceId || !periodStart) return null;
  return {
    kind: "family_payment",
    entityId: invoiceId,
    periodStart,
    stage: "awaiting_payment",
    invoiceReference: `MIA-${invoiceId.slice(0, 8).toUpperCase()}`,
  };
}

export function projectOpenObjectives(input: {
  lessonCollections: LessonObjectiveRecord[];
  familyInvoices: PaymentObjectiveRecord[];
}): {
  primaryObjective: OpenObjective | null;
  objectives: OpenObjective[];
} {
  const lessonCollections = Array.isArray(input?.lessonCollections) ? input.lessonCollections : [];
  const familyInvoices = Array.isArray(input?.familyInvoices) ? input.familyInvoices : [];
  const objectives = [
    ...lessonCollections.flatMap((collection) => {
      const objective = lessonObjective(collection);
      return objective ? [objective] : [];
    }),
    ...familyInvoices.flatMap((invoice) => {
      const objective = paymentObjective(invoice);
      return objective ? [objective] : [];
    }),
  ]
    .sort((left, right) => PRIORITY[left.stage] - PRIORITY[right.stage]
      || left.periodStart.localeCompare(right.periodStart)
      || left.entityId.localeCompare(right.entityId))
    .slice(0, 3);

  return {
    primaryObjective: objectives[0] ?? null,
    objectives,
  };
}
