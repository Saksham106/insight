import type { PublicFeeStatement } from "@/lib/hermes/fee-statements";

type LineItem = PublicFeeStatement["lineItems"][number];

export type FeeStatementRow =
  | { kind: "item"; item: LineItem; sourceIndex: number }
  | {
      kind: "group";
      teacherName: string;
      items: Array<{ item: LineItem; sourceIndex: number }>;
      durationMinutes: number;
      rateMinor: number | null;
      amountMinor: number;
    };

const LONG_STATEMENT_THRESHOLD = 8;
const GROUP_MINIMUM = 2;

function teacherKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function buildFeeStatementRows(lineItems: PublicFeeStatement["lineItems"]): FeeStatementRow[] {
  if (lineItems.length < LONG_STATEMENT_THRESHOLD) {
    return lineItems.map((item, sourceIndex) => ({ kind: "item", item, sourceIndex }));
  }

  const datedByTeacher = new Map<string, Array<{ item: LineItem; sourceIndex: number }>>();
  lineItems.forEach((item, sourceIndex) => {
    if (!item.lessonDate) return;
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
    const key = teacherKey(item.teacherName);
    if (!item.lessonDate || !groupedTeachers.has(key)) {
      rows.push({ kind: "item", item, sourceIndex });
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
