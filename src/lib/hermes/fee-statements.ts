import { createHash } from "node:crypto";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export type FeeStatementSource = {
  workbook: string;
  sheet: string;
  row: number;
};

export type FeeStatementLineItem = {
  lessonDate: string | null;
  teacherName: string;
  subject: string | null;
  durationMinutes: number;
  rateMinor: number;
  amountMinor: number;
  note?: string;
  source: FeeStatementSource;
};

export type FeeStatementInput = {
  studentName: string;
  billedToName?: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  currency: string;
  lineItems: FeeStatementLineItem[];
};

export type SanitizedFeeStatement = Omit<FeeStatementInput, "billedToName" | "dueDate"> & {
  billedToName: string | null;
  dueDate: string | null;
  totalMinor: number;
};

export type PublicFeeStatement = {
  id: string;
  statementReference: string;
  status: "published" | "paid";
  studentName: string;
  billedToName: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  currency: string;
  totalMinor: number;
  issuedAt: string;
  paidAt: string | null;
  lineItems: Array<Omit<FeeStatementLineItem, "source">>;
};

function fail(code: string): never {
  throw new Error(code);
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_statement_input");
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, field: string, max = 120): string {
  if (typeof value !== "string") fail(`invalid_${field}`);
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > max || /[\r\n]/.test(value)) fail(`invalid_${field}`);
  return clean;
}

function optionalText(value: unknown, field: string, max = 120): string | null {
  if (value == null || value === "") return null;
  return cleanText(value, field, max);
}

function date(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) fail(`invalid_${field}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail(`invalid_${field}`);
  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  return date(value, field);
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(`invalid_${field}`);
  return value as number;
}

export function sanitizeFeeStatementInput(input: unknown): SanitizedFeeStatement {
  const value = plainObject(input);
  const studentName = cleanText(value.studentName, "student_name");
  const billedToName = optionalText(value.billedToName, "billed_to_name");
  const periodStart = date(value.periodStart, "period_start");
  const periodEnd = date(value.periodEnd, "period_end");
  const dueDate = optionalDate(value.dueDate, "due_date");
  if (periodStart > periodEnd || (dueDate && dueDate < periodEnd)) fail("invalid_statement_period");

  if (typeof value.currency !== "string") fail("invalid_statement_currency");
  const currency = value.currency.trim().toUpperCase();
  if (!CURRENCY.test(currency)) fail("invalid_statement_currency");

  if (!Array.isArray(value.lineItems) || value.lineItems.length < 1 || value.lineItems.length > 100) {
    fail("invalid_statement_line_items");
  }

  const sourceKeys = new Set<string>();
  const lineItems = value.lineItems.map((raw) => {
    const item = plainObject(raw);
    const lessonDate = optionalDate(item.lessonDate, "lesson_date");
    if (lessonDate && (lessonDate < periodStart || lessonDate > periodEnd)) fail("lesson_outside_statement_period");
    const durationMinutes = integer(item.durationMinutes, "duration_minutes", 1, 24 * 60);
    const rateMinor = integer(item.rateMinor, "rate_minor", 0, 1_000_000_000_000);
    const amountMinor = integer(item.amountMinor, "amount_minor", 0, 1_000_000_000_000);
    if (amountMinor * 60 !== durationMinutes * rateMinor) fail("statement_amount_mismatch");

    const sourceValue = plainObject(item.source);
    const source = {
      workbook: cleanText(sourceValue.workbook, "source_workbook", 160),
      sheet: cleanText(sourceValue.sheet, "source_sheet", 160),
      row: integer(sourceValue.row, "source_row", 1, 1_000_000),
    };
    const sourceKey = `${source.workbook}\u0000${source.sheet}\u0000${source.row}`;
    if (sourceKeys.has(sourceKey)) fail("duplicate_statement_source");
    sourceKeys.add(sourceKey);

    const note = optionalText(item.note, "line_item_note", 240);
    if (!lessonDate && !note) fail("aggregate_statement_note_required");
    return {
      lessonDate,
      teacherName: cleanText(item.teacherName, "teacher_name"),
      subject: optionalText(item.subject, "subject"),
      durationMinutes,
      rateMinor,
      amountMinor,
      ...(note ? { note } : {}),
      source,
    };
  });

  const totalMinor = lineItems.reduce((sum, item) => {
    const next = sum + item.amountMinor;
    if (!Number.isSafeInteger(next)) fail("statement_total_overflow");
    return next;
  }, 0);

  return { studentName, billedToName, periodStart, periodEnd, dueDate, currency, lineItems, totalMinor };
}

export function statementTokenHash(token: string): string {
  if (!TOKEN.test(token)) fail("invalid_statement_token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function projectPublicFeeStatement(row: Record<string, unknown>): PublicFeeStatement {
  const lineItems = Array.isArray(row.line_items) ? row.line_items : [];
  const status = row.status === "paid" ? "paid" : row.status === "published" ? "published" : fail("unavailable_statement");

  return {
    id: cleanText(row.id, "statement_id"),
    statementReference: cleanText(row.statement_reference, "statement_reference"),
    status,
    studentName: cleanText(row.student_name, "student_name"),
    billedToName: optionalText(row.billed_to_name, "billed_to_name"),
    periodStart: date(row.period_start, "period_start"),
    periodEnd: date(row.period_end, "period_end"),
    dueDate: optionalDate(row.due_date, "due_date"),
    currency: cleanText(row.currency, "statement_currency", 3),
    totalMinor: integer(row.total_minor, "total_minor", 0, Number.MAX_SAFE_INTEGER),
    issuedAt: cleanText(row.issued_at, "issued_at", 40),
    paidAt: optionalText(row.paid_at, "paid_at", 40),
    lineItems: lineItems.map((raw) => {
      const item = plainObject(raw);
      const note = optionalText(item.note, "line_item_note", 240);
      const lessonDate = optionalDate(item.lessonDate, "lesson_date");
      if (!lessonDate && !note) fail("aggregate_statement_note_required");
      return {
        lessonDate,
        teacherName: cleanText(item.teacherName, "teacher_name"),
        subject: optionalText(item.subject, "subject"),
        durationMinutes: integer(item.durationMinutes, "duration_minutes", 1, 24 * 60),
        rateMinor: integer(item.rateMinor, "rate_minor", 0, 1_000_000_000_000),
        amountMinor: integer(item.amountMinor, "amount_minor", 0, 1_000_000_000_000),
        ...(note ? { note } : {}),
      };
    }),
  };
}
