/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const modulePath = path.join(__dirname, "fee-statements.ts");

function sampleInput() {
  return {
    studentName: " Example Student ",
    billedToName: "Example Family",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    currency: "vnd",
    dueDate: "2026-09-07",
    lineItems: [
      {
        lessonDate: "2026-08-11",
        teacherName: "Teacher A",
        subject: "Mathematics",
        durationMinutes: 90,
        rateMinor: 600000,
        amountMinor: 900000,
        source: { workbook: "Example Workbook", sheet: "August Classes", row: 12 },
      },
      {
        lessonDate: "2026-08-17",
        teacherName: "Teacher A",
        subject: "Mathematics",
        durationMinutes: 60,
        rateMinor: 600000,
        amountMinor: 600000,
        source: { workbook: "Example Workbook", sheet: "August Classes", row: 18 },
      },
    ],
  };
}

test("normalizes a reconciled statement and computes the total from line items", () => {
  const { sanitizeFeeStatementInput } = require(modulePath);
  const result = sanitizeFeeStatementInput(sampleInput());
  assert.equal(result.studentName, "Example Student");
  assert.equal(result.currency, "VND");
  assert.equal(result.totalMinor, 1500000);
  assert.equal(result.lineItems[0].source.row, 12);
});

test("rejects duplicate source rows and arithmetic that does not match duration × rate", () => {
  const { sanitizeFeeStatementInput } = require(modulePath);
  const duplicate = sampleInput();
  duplicate.lineItems[1].source = { ...duplicate.lineItems[0].source };
  assert.throws(() => sanitizeFeeStatementInput(duplicate), /duplicate_statement_source/);

  const mismatch = sampleInput();
  mismatch.lineItems[0].amountMinor = 1100000;
  assert.throws(() => sanitizeFeeStatementInput(mismatch), /statement_amount_mismatch/);
});

test("accepts honest aggregate tutor rows only when missing dates are disclosed", () => {
  const { sanitizeFeeStatementInput } = require(modulePath);
  const aggregate = sampleInput();
  aggregate.lineItems = [{
    lessonDate: null,
    teacherName: "Teacher B",
    subject: null,
    durationMinutes: 240,
    rateMinor: 750000,
    amountMinor: 3000000,
    note: "August aggregate; exact lesson dates are unavailable in the source.",
    source: { workbook: "Example Workbook", sheet: "Teacher B", row: 21 },
  }];
  const result = sanitizeFeeStatementInput(aggregate);
  assert.equal(result.lineItems[0].lessonDate, null);
  assert.equal(result.lineItems[0].subject, null);
  assert.equal(result.totalMinor, 3000000);

  delete aggregate.lineItems[0].note;
  assert.throws(() => sanitizeFeeStatementInput(aggregate), /aggregate_statement_note_required/);
});

test("public projection omits spreadsheet coordinates while keeping the immutable charges", () => {
  const { projectPublicFeeStatement, sanitizeFeeStatementInput } = require(modulePath);
  const normalized = sanitizeFeeStatementInput(sampleInput());
  const projected = projectPublicFeeStatement({
    id: "statement-1",
    statement_reference: "MIA-202608-A1B2C3",
    status: "published",
    issued_at: "2026-08-31T12:00:00.000Z",
    paid_at: null,
    voided_at: null,
    ...normalized,
    student_name: normalized.studentName,
    billed_to_name: normalized.billedToName,
    period_start: normalized.periodStart,
    period_end: normalized.periodEnd,
    due_date: normalized.dueDate,
    total_minor: normalized.totalMinor,
    line_items: normalized.lineItems,
  });
  assert.equal(projected.statementReference, "MIA-202608-A1B2C3");
  assert.equal(projected.lineItems[0].amountMinor, 900000);
  assert.equal(JSON.stringify(projected).includes("August Classes"), false);
  assert.equal(JSON.stringify(projected).includes('"row":12'), false);
});

test("accepts only high-entropy URL-safe statement tokens", () => {
  const { statementTokenHash } = require(modulePath);
  const token = "7xK3vA8pQ2mN6sT9wY4cD1fG5hJ8kL2z";
  assert.match(statementTokenHash(token), /^[a-f0-9]{64}$/);
  for (const invalid of ["short", "contains space xxxxxxxxxxxxxxxxxxxxxxxxx", "../../etc/passwd-xxxxxxxxxxxxxxxxxxxx"]) {
    assert.throws(() => statementTokenHash(invalid), /invalid_statement_token/);
  }
});
