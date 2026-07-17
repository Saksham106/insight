const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MINOR_AMOUNT = 1_000_000_000_000;

function recordValue(input: unknown, error: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(error);
  return input as Record<string, unknown>;
}

function uuidValue(input: unknown, error: string): string {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) throw new Error(error);
  return input.toLowerCase();
}

function boundedInteger(input: unknown, minimum: number, maximum: number, error: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < minimum || input > maximum) throw new Error(error);
  return input;
}

function normalizedName(input: unknown): string {
  if (typeof input !== "string") throw new Error("invalid_reported_student_name");
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 1 || value.length > 160) throw new Error("invalid_reported_student_name");
  return value;
}

function isoDate(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error("invalid_lesson_date");
  const value = new Date(`${input}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== input) throw new Error("invalid_lesson_date");
  return input;
}

export function parseSettlementMonth(input: unknown): string {
  if (typeof input !== "string") throw new Error("invalid_settlement_month");
  const candidate = /^\d{4}-\d{2}$/.test(input) ? `${input}-01` : input;
  if (!/^\d{4}-\d{2}-01$/.test(candidate)) throw new Error("invalid_settlement_month");
  const value = new Date(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== candidate) throw new Error("invalid_settlement_month");
  return candidate;
}

export function parseCurrency(input: unknown): string {
  if (typeof input !== "string") throw new Error("invalid_currency");
  const value = input.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new Error("invalid_currency");
  return value;
}

export function parseMinorAmount(input: unknown): number {
  return boundedInteger(input, 0, MAX_MINOR_AMOUNT, "invalid_minor_amount");
}

export interface TutorReportLineInput {
  reportedStudentName: string;
  studentContactId?: string;
  classCount: number;
  totalMinutes: number;
  lessonDates: string[];
}

export interface TutorReportInput {
  claimedPayoutMinor: number;
  lines: TutorReportLineInput[];
}

export function sanitizeTutorReport(input: unknown): TutorReportInput {
  const report = recordValue(input, "invalid_tutor_report");
  if (!Array.isArray(report.lines) || report.lines.length < 1 || report.lines.length > 100) throw new Error("invalid_report_lines");
  const seen = new Set<string>();
  const lines = report.lines.map((raw): TutorReportLineInput => {
    const line = recordValue(raw, "invalid_report_line");
    const reportedStudentName = normalizedName(line.reportedStudentName);
    const studentContactId = line.studentContactId === undefined ? undefined : uuidValue(line.studentContactId, "invalid_student_contact_id");
    const classCount = boundedInteger(line.classCount, 1, 200, "invalid_class_count");
    const totalMinutes = boundedInteger(line.totalMinutes, 1, 50_000, "invalid_total_minutes");
    const lessonDates = line.lessonDates === undefined ? [] : Array.isArray(line.lessonDates) ? line.lessonDates.map(isoDate) : (() => { throw new Error("invalid_lesson_dates"); })();
    if (lessonDates.length > classCount) throw new Error("too_many_lesson_dates");
    const key = studentContactId ?? reportedStudentName.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new Error("duplicate_student_line");
    seen.add(key);
    return { reportedStudentName, ...(studentContactId ? { studentContactId } : {}), classCount, totalMinutes, lessonDates };
  });
  return { claimedPayoutMinor: parseMinorAmount(report.claimedPayoutMinor), lines };
}

export interface FamilyChargeInput {
  reportLineId: string;
  studentContactId: string;
  billedContactId: string;
  familyChargeMinor: number;
}

export function sanitizeFamilyCharges(input: unknown): FamilyChargeInput[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1000) throw new Error("invalid_family_charges");
  const seen = new Set<string>();
  return input.map((raw): FamilyChargeInput => {
    const charge = recordValue(raw, "invalid_family_charge");
    const reportLineId = uuidValue(charge.reportLineId, "invalid_report_line_id");
    if (seen.has(reportLineId)) throw new Error("duplicate_report_line_charge");
    seen.add(reportLineId);
    return {
      reportLineId,
      studentContactId: uuidValue(charge.studentContactId, "invalid_student_contact_id"),
      billedContactId: uuidValue(charge.billedContactId, "invalid_billed_contact_id"),
      familyChargeMinor: parseMinorAmount(charge.familyChargeMinor),
    };
  });
}

interface TutorPayoutSummary {
  reportId: string;
  tutorContactId: string;
  amountMinor: number;
}

interface FamilyChargeSummary {
  billedContactId: string;
  studentContactId: string;
  amountMinor: number;
}

export function buildSettlementApprovalSummary(input: {
  periodStart: unknown;
  currency: unknown;
  version: unknown;
  tutorPayouts: TutorPayoutSummary[];
  familyCharges: FamilyChargeSummary[];
}) {
  const tutorPayouts = input.tutorPayouts.map((item) => ({
    reportId: uuidValue(item.reportId, "invalid_report_id"),
    tutorContactId: uuidValue(item.tutorContactId, "invalid_tutor_contact_id"),
    amountMinor: parseMinorAmount(item.amountMinor),
  })).sort((a, b) => a.tutorContactId.localeCompare(b.tutorContactId) || a.reportId.localeCompare(b.reportId));
  const familyCharges = input.familyCharges.map((item) => ({
    billedContactId: uuidValue(item.billedContactId, "invalid_billed_contact_id"),
    studentContactId: uuidValue(item.studentContactId, "invalid_student_contact_id"),
    amountMinor: parseMinorAmount(item.amountMinor),
  })).sort((a, b) => a.billedContactId.localeCompare(b.billedContactId) || a.studentContactId.localeCompare(b.studentContactId));
  return {
    periodStart: parseSettlementMonth(input.periodStart),
    currency: parseCurrency(input.currency),
    version: boundedInteger(input.version, 0, 1_000_000, "invalid_settlement_version"),
    tutorPayouts,
    familyCharges,
    totals: {
      familyChargesMinor: familyCharges.reduce((sum, item) => sum + item.amountMinor, 0),
      tutorPayoutsMinor: tutorPayouts.reduce((sum, item) => sum + item.amountMinor, 0),
    },
  };
}
