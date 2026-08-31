/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_m, q, target) => `from ${q}./${target}.ts${q}`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const modulePath = path.join(__dirname, "fee-statement-public.ts");

test("loads a published statement by its token hash and never queries with the raw token", async () => {
  const calls = [];
  const row = {
    id: "statement-1", statement_reference: "MIA-202608-A1B2C3", status: "published",
    student_name: "Example Student", billed_to_name: null, period_start: "2026-08-01", period_end: "2026-08-31", due_date: null,
    currency: "VND", total_minor: 500000, issued_at: "2026-08-31T00:00:00Z", paid_at: null,
    line_items: [{ lessonDate: "2026-08-11", teacherName: "Teacher A", subject: "Maths", durationMinutes: 60, rateMinor: 500000, amountMinor: 500000, source: { workbook: "Private", sheet: "August", row: 3 } }],
  };
  const client = { from(table) { calls.push(["from", table]); return { select() { return { eq(field, value) { calls.push(["eq", field, value]); return { in() { return { maybeSingle: async () => ({ data: row, error: null }) }; } }; } }; } }; } };
  const { loadPublicFeeStatement } = require(modulePath);
  const token = "7xK3vA8pQ2mN6sT9wY4cD1fG5hJ8kL2z";
  const result = await loadPublicFeeStatement(token, client);
  assert.equal(result.studentName, "Example Student");
  assert.match(calls[1][2], /^[a-f0-9]{64}$/);
  assert.notEqual(calls[1][2], token);
  assert.equal(JSON.stringify(result).includes("Private"), false);
});
