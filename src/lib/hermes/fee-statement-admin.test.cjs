/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
test("admin cards reload with the same net balance as parent receipts", () => {
  const { attachFeeStatementBalances } = require("./fee-statement-admin.ts");
  const [row] = attachFeeStatementBalances([{ id: "a", total_minor: 1000, adjustment_rows: [
    { id: "b", kind: "extra_fee", label: "Test", amount_minor: 200, created_at: "2026-10-01T00:00:00Z", reference: "private" },
    { id: "c", kind: "advance", label: "Paid", amount_minor: 300, created_at: "2026-10-01T00:00:00Z" },
  ] }]);
  assert.equal(row.total_minor, 1000);
  assert.equal(row.balance.amountDueMinor, 900);
  assert.equal(row.balance.version, 2);
  assert.equal(row.adjustments.length, 2);
  assert.doesNotMatch(JSON.stringify(row), /private|adjustment_rows/);
});
