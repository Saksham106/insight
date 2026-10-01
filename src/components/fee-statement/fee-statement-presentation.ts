import type { PublicFeeStatement } from "@/lib/hermes/fee-statements";

type LineItem = PublicFeeStatement["lineItems"][number];
type LessonItem = Exclude<LineItem, { kind: "fee" }>;
type IndexedLesson = { item: LessonItem; sourceIndex: number };

export function formatDurationHours(minutes: number) {
  const value = minutes / 60;
  const displayed = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return `${displayed} hr${value === 1 ? "" : "s"}`;
}

export type FeeStatementRow =
  | { kind: "item"; item: LineItem; sourceIndex: number; classDates?: string[] }
  | {
      kind: "group";
      teacherName: string;
      items: IndexedLesson[];
      durationMinutes: number;
      rateMinor: number | null;
      amountMinor: number;
    };

const LONG_STATEMENT_THRESHOLD = 8;
const GROUP_MINIMUM = 2;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function parseAggregateLessonDates(note: string | undefined, periodStart: string): string[] {
  if (!note || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return [];
  const period = new Date(`${periodStart}T00:00:00Z`);
  if (Number.isNaN(period.valueOf()) || period.toISOString().slice(0, 10) !== periodStart) return [];
  const month = Number(periodStart.slice(5, 7));
  const name = MONTHS[month - 1];
  const match = note.match(new RegExp(`\\b(?:${name}|${name.slice(0, 3)})\\s*(?:classes\\s+(?:on\\s+)?)?([0-9]+(?:\\s*(?:,|and)\\s*[0-9]+)*\\s*)(?=[;.]|$)`, "i"));
  if (!match) return [];
  const prefix = note.slice(0, match.index).split(/[;.]/).at(-1) ?? "";
  if (/cancel(?:led|ed|lation)?|excluded|not\s+(?:held|taken|provided)/i.test(prefix)) return [];
  const tokens = match[1].split(/,|\band\b/i).map((value) => value.trim());
  if (tokens.some((token) => !/^\d{1,2}$/.test(token))) return [];
  const year = Number(periodStart.slice(0, 4));
  const dates = tokens.map((token) => {
    const day = Number(token);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  return dates.every(Boolean) ? [...new Set(dates as string[])].sort() : [];
}

function teacherKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function buildFeeStatementRows(lineItems: PublicFeeStatement["lineItems"], periodStart?: string): FeeStatementRow[] {
  const rowItem = (item: LineItem, sourceIndex: number): FeeStatementRow => ({
    kind: "item", item, sourceIndex,
    ...(item.kind !== "fee" && !item.lessonDate && periodStart ? { classDates: parseAggregateLessonDates(item.note, periodStart) } : {}),
  });
  if (lineItems.length < LONG_STATEMENT_THRESHOLD) {
    return lineItems.map(rowItem);
  }

  const datedByTeacher = new Map<string, IndexedLesson[]>();
  lineItems.forEach((item, sourceIndex) => {
    if (item.kind === "fee" || !item.lessonDate) return;
    const key = teacherKey(item.teacherName);
    const entries = datedByTeacher.get(key) ?? [];
    entries.push({ item, sourceIndex });
    datedByTeacher.set(key, entries);
  });

  const groupedTeachers = new Set(
    [...datedByTeacher.entries()].filter(([, entries]) => entries.length >= GROUP_MINIMUM).map(([key]) => key),
  );
  const emitted = new Set<string>();
  const rows: FeeStatementRow[] = [];

  lineItems.forEach((item, sourceIndex) => {
    if (item.kind === "fee" || !item.lessonDate) {
      rows.push(rowItem(item, sourceIndex));
      return;
    }
    const key = teacherKey(item.teacherName);
    if (!groupedTeachers.has(key)) {
      rows.push(rowItem(item, sourceIndex));
      return;
    }
    if (emitted.has(key)) return;
    emitted.add(key);
    const entries = datedByTeacher.get(key) ?? [];
    const rates = new Set(entries.map((entry) => entry.item.rateMinor));
    rows.push({
      kind: "group",
      teacherName: item.teacherName,
      items: entries,
      durationMinutes: entries.reduce((sum, entry) => sum + entry.item.durationMinutes, 0),
      rateMinor: rates.size === 1 ? entries[0].item.rateMinor : null,
      amountMinor: entries.reduce((sum, entry) => sum + entry.item.amountMinor, 0),
    });
  });

  return rows;
}

export function parentVisibleNote(note?: string): string | null {
  if (!note) return null;
  if (/exact lesson dates are unavailable in the source/i.test(note)) return null;
  return note;
}

export function canOfferBankQr(status: PublicFeeStatement["status"], currency: string): boolean {
  return status === "published" && currency.trim().toUpperCase() === "VND";
}
