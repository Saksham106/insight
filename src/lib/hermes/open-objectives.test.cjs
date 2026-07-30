/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { projectOpenObjectives } = require(path.join(__dirname, "open-objectives.ts"));

const CYCLE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_COLLECTION_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const INVOICE_ID = "44444444-4444-4444-8444-444444444444";

test("projects requested tutor work as awaiting_report", () => {
  const result = projectOpenObjectives({
    lessonCollections: [{
      id: COLLECTION_ID,
      cycleId: CYCLE_ID,
      status: "requested",
      periodStart: "2026-07-01",
      cycleStatus: "collecting",
      reports: [],
    }],
    familyInvoices: [],
  });

  assert.deepEqual(result, {
    primaryObjective: {
      kind: "lesson_report",
      entityId: COLLECTION_ID,
      cycleId: CYCLE_ID,
      periodStart: "2026-07-01",
      stage: "awaiting_report",
    },
    objectives: [{
      kind: "lesson_report",
      entityId: COLLECTION_ID,
      cycleId: CYCLE_ID,
      periodStart: "2026-07-01",
      stage: "awaiting_report",
    }],
  });
});

test("projects the active pending report as awaiting_confirmation", () => {
  const result = projectOpenObjectives({
    lessonCollections: [{
      id: COLLECTION_ID,
      cycleId: CYCLE_ID,
      status: "awaiting_teacher_confirmation",
      periodStart: "2026-07-01",
      cycleStatus: "collecting",
      reports: [
        {
          id: REPORT_ID,
          revision: 2,
          status: "awaiting_teacher_confirmation",
          submittedAt: "2026-07-30T12:00:00.000Z",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          revision: 1,
          status: "superseded",
          submittedAt: "2026-07-29T12:00:00.000Z",
        },
      ],
    }],
    familyInvoices: [],
  });

  assert.deepEqual(result.primaryObjective, {
    kind: "lesson_report",
    entityId: REPORT_ID,
    cycleId: CYCLE_ID,
    periodStart: "2026-07-01",
    stage: "awaiting_confirmation",
  });
});

test("excludes lesson work that was not requested, confirmed, or belongs to a confirmed cycle", () => {
  const result = projectOpenObjectives({
    lessonCollections: [
      { id: COLLECTION_ID, status: "not_requested", periodStart: "2026-05-01", cycleStatus: "collecting", reports: [] },
      { id: SECOND_COLLECTION_ID, status: "confirmed", periodStart: "2026-06-01", cycleStatus: "ready_for_swati", reports: [] },
      { id: "66666666-6666-4666-8666-666666666666", status: "requested", periodStart: "2026-07-01", cycleStatus: "confirmed", reports: [] },
    ],
    familyInvoices: [],
  });

  assert.deepEqual(result, { primaryObjective: null, objectives: [] });
});

test("does not treat superseded or confirmed revisions as pending confirmation", () => {
  const result = projectOpenObjectives({
    lessonCollections: [{
      id: COLLECTION_ID,
      status: "awaiting_teacher_confirmation",
      periodStart: "2026-07-01",
      cycleStatus: "collecting",
      reports: [
        { id: REPORT_ID, revision: 2, status: "confirmed", submittedAt: "2026-07-30T12:00:00.000Z" },
        { id: "55555555-5555-4555-8555-555555555555", revision: 1, status: "superseded", submittedAt: "2026-07-29T12:00:00.000Z" },
      ],
    }],
    familyInvoices: [],
  });

  assert.deepEqual(result, { primaryObjective: null, objectives: [] });
});

test("projects only sent family invoices with a safe invoice reference", () => {
  const result = projectOpenObjectives({
    lessonCollections: [],
    familyInvoices: [
      { id: INVOICE_ID, status: "sent", periodStart: "2026-07-01" },
      { id: "55555555-5555-4555-8555-555555555555", status: "approved", periodStart: "2026-07-01" },
      { id: "66666666-6666-4666-8666-666666666666", status: "paid", periodStart: "2026-06-01" },
      { id: "77777777-7777-4777-8777-777777777777", status: "void", periodStart: "2026-05-01" },
    ],
  });

  assert.deepEqual(result.objectives, [{
    kind: "family_payment",
    entityId: INVOICE_ID,
    periodStart: "2026-07-01",
    stage: "awaiting_payment",
    invoiceReference: "MIA-44444444",
  }]);
});

test("prioritizes confirmation, then reports, then payment and sorts older periods first", () => {
  const result = projectOpenObjectives({
    lessonCollections: [
      { id: COLLECTION_ID, cycleId: CYCLE_ID, status: "requested", periodStart: "2026-07-01", cycleStatus: "collecting", reports: [] },
      { id: SECOND_COLLECTION_ID, cycleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "requested", periodStart: "2026-06-01", cycleStatus: "collecting", reports: [] },
      {
        id: "66666666-6666-4666-8666-666666666666",
        cycleId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        status: "awaiting_teacher_confirmation",
        periodStart: "2026-08-01",
        cycleStatus: "collecting",
        reports: [{ id: REPORT_ID, revision: 3, status: "awaiting_teacher_confirmation", submittedAt: "2026-08-30T12:00:00.000Z" }],
      },
    ],
    familyInvoices: [{ id: INVOICE_ID, status: "sent", periodStart: "2026-05-01" }],
  });

  assert.deepEqual(result.objectives.map((objective) => objective.entityId), [
    REPORT_ID,
    SECOND_COLLECTION_ID,
    COLLECTION_ID,
  ]);
  assert.equal(result.primaryObjective.stage, "awaiting_confirmation");
});

test("caps output at three and discards raw or unknown fields", () => {
  const lessonCollections = Array.from({ length: 5 }, (_, index) => {
    const digit = String(index + 1);
    return {
      id: digit.repeat(8) + "-" + digit.repeat(4) + "-4" + digit.repeat(3) + "-8" + digit.repeat(3) + "-" + digit.repeat(12),
      cycleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "requested",
      periodStart: `2026-0${index + 1}-01`,
      cycleStatus: "collecting",
      reports: [],
      privateNote: "never expose",
    };
  });

  const result = projectOpenObjectives({ lessonCollections, familyInvoices: [] });

  assert.equal(result.objectives.length, 3);
  assert.equal(JSON.stringify(result).includes("privateNote"), false);
  assert.equal(JSON.stringify(result).includes("never expose"), false);
});

test("ignores malformed records instead of creating conversational claims", () => {
  const result = projectOpenObjectives({
    lessonCollections: [
      { id: "not-a-uuid", cycleId: CYCLE_ID, status: "requested", periodStart: "2026-07-01", cycleStatus: "collecting", reports: [] },
      { id: COLLECTION_ID, cycleId: CYCLE_ID, status: "requested", periodStart: "2026-07-02", cycleStatus: "collecting", reports: [] },
      { id: SECOND_COLLECTION_ID, cycleId: CYCLE_ID, status: "unknown", periodStart: "2026-07-01", cycleStatus: "collecting", reports: [] },
      { id: COLLECTION_ID, cycleId: "not-a-uuid", status: "requested", periodStart: "2026-07-01", cycleStatus: "collecting", reports: [] },
    ],
    familyInvoices: [
      { id: INVOICE_ID, status: "sent", periodStart: "not-a-month" },
      { id: "also-invalid", status: "sent", periodStart: "2026-07-01" },
    ],
  });

  assert.deepEqual(result, { primaryObjective: null, objectives: [] });
});
