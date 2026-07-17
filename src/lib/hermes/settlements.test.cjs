/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const {
  buildSettlementApprovalSummary,
  parseCurrency,
  parseMinorAmount,
  parseSettlementMonth,
  sanitizeFamilyCharges,
  sanitizeTutorReport,
} = require(path.join(__dirname, "settlements.ts"));

const UUIDS = {
  report: "10000000-0000-4000-8000-000000000001",
  line: "20000000-0000-4000-8000-000000000001",
  tutor: "30000000-0000-4000-8000-000000000001",
  student: "40000000-0000-4000-8000-000000000001",
  billed: "50000000-0000-4000-8000-000000000001",
};

test("normalizes settlement month, currency, and integer minor amounts", () => {
  assert.equal(parseSettlementMonth("2026-06"), "2026-06-01");
  assert.equal(parseSettlementMonth("2026-06-01"), "2026-06-01");
  assert.equal(parseCurrency(" vnd "), "VND");
  assert.equal(parseMinorAmount(1250000), 1250000);
  assert.throws(() => parseSettlementMonth("2026-06-02"), /invalid_settlement_month/);
  assert.throws(() => parseSettlementMonth("2026-13"), /invalid_settlement_month/);
  assert.throws(() => parseCurrency("USDT"), /invalid_currency/);
  assert.throws(() => parseMinorAmount(1.5), /invalid_minor_amount/);
  assert.throws(() => parseMinorAmount(-1), /invalid_minor_amount/);
});

test("sanitizes bounded tutor evidence without retaining transcript fields", () => {
  assert.deepEqual(sanitizeTutorReport({
    claimedPayoutMinor: 350000,
    transcript: "private conversation",
    lines: [{
      reportedStudentName: "  Anika Rao  ",
      studentContactId: UUIDS.student,
      classCount: 2,
      totalMinutes: 120,
      lessonDates: ["2026-06-02", "2026-06-09"],
      transcript: "drop this",
      extra: "drop this too",
    }],
  }), {
    claimedPayoutMinor: 350000,
    lines: [{
      reportedStudentName: "Anika Rao",
      studentContactId: UUIDS.student,
      classCount: 2,
      totalMinutes: 120,
      lessonDates: ["2026-06-02", "2026-06-09"],
    }],
  });
});

test("rejects duplicate, excessive, incomplete, or internally inconsistent report lines", () => {
  const line = { reportedStudentName: "Anika Rao", classCount: 1, totalMinutes: 60, lessonDates: ["2026-06-02"] };
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: [line, { ...line, reportedStudentName: " anika  rao " }] }), /duplicate_student_line/);
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: [{ ...line, classCount: 0 }] }), /invalid_class_count/);
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: [{ ...line, totalMinutes: 0 }] }), /invalid_total_minutes/);
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: [{ ...line, lessonDates: ["2026-06-02", "2026-06-03"] }] }), /too_many_lesson_dates/);
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: [] }), /invalid_report_lines/);
  assert.throws(() => sanitizeTutorReport({ claimedPayoutMinor: 1, lines: Array.from({ length: 101 }, (_, i) => ({ ...line, reportedStudentName: `Student ${i}` })) }), /invalid_report_lines/);
});

test("sanitizes exact family charge assignments", () => {
  assert.deepEqual(sanitizeFamilyCharges([{
    reportLineId: UUIDS.line,
    studentContactId: UUIDS.student,
    billedContactId: UUIDS.billed,
    familyChargeMinor: 600000,
    note: "not stored",
  }]), [{
    reportLineId: UUIDS.line,
    studentContactId: UUIDS.student,
    billedContactId: UUIDS.billed,
    familyChargeMinor: 600000,
  }]);
  assert.throws(() => sanitizeFamilyCharges([]), /invalid_family_charges/);
  assert.throws(() => sanitizeFamilyCharges([
    { reportLineId: UUIDS.line, studentContactId: UUIDS.student, billedContactId: UUIDS.billed, familyChargeMinor: 1 },
    { reportLineId: UUIDS.line, studentContactId: UUIDS.student, billedContactId: UUIDS.billed, familyChargeMinor: 2 },
  ]), /duplicate_report_line_charge/);
});

test("builds a deterministic exact approval summary and totals", () => {
  const first = buildSettlementApprovalSummary({
    periodStart: "2026-06-01",
    currency: "VND",
    version: 3,
    tutorPayouts: [
      { reportId: "10000000-0000-4000-8000-000000000002", tutorContactId: "30000000-0000-4000-8000-000000000002", amountMinor: 200000 },
      { reportId: UUIDS.report, tutorContactId: UUIDS.tutor, amountMinor: 350000 },
    ],
    familyCharges: [
      { billedContactId: "50000000-0000-4000-8000-000000000002", studentContactId: "40000000-0000-4000-8000-000000000002", amountMinor: 250000 },
      { billedContactId: UUIDS.billed, studentContactId: UUIDS.student, amountMinor: 600000 },
    ],
  });
  const second = buildSettlementApprovalSummary({
    periodStart: "2026-06",
    currency: "vnd",
    version: 3,
    tutorPayouts: [...first.tutorPayouts].reverse(),
    familyCharges: [...first.familyCharges].reverse(),
  });
  assert.deepEqual(second, first);
  assert.deepEqual(first.totals, { familyChargesMinor: 850000, tutorPayoutsMinor: 550000 });
});

test("settlement evidence logic has no session, Calendar, transcript, or database dependency", () => {
  const source = fs.readFileSync(path.join(__dirname, "settlements.ts"), "utf8");
  assert.doesNotMatch(source, /from\(["']sessions["']\)|\bsessions\b/i);
  assert.doesNotMatch(source, /calendar/i);
  assert.doesNotMatch(source, /transcript/i);
  assert.doesNotMatch(source, /supabase/i);
});
