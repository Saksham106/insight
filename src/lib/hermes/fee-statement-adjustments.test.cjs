/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText, filename);
};
const { calculateFeeStatementBalance, sanitizeFeeStatementAdjustmentInput } = require(path.join(__dirname, "fee-statement-adjustments.ts"));

test("calculates immutable base plus fees minus invoice-applied advances", () => {
  assert.deepEqual(calculateFeeStatementBalance(1000, [
    { kind: "extra_fee", amountMinor: 200 }, { kind: "advance", amountMinor: 300 },
  ]), { baseMinor: 1000, extraFeesMinor: 200, advancesMinor: 300, grossMinor: 1200, amountDueMinor: 900, version: 2 });
});

test("rejects over-applied advances, unsafe arithmetic, and malformed input", () => {
  assert.throws(() => calculateFeeStatementBalance(100, [{ kind: "advance", amountMinor: 101 }]), /invalid_fee_statement_balance/);
  assert.throws(() => calculateFeeStatementBalance(Number.MAX_SAFE_INTEGER, []), /invalid_fee_statement_balance/);
  assert.throws(() => sanitizeFeeStatementAdjustmentInput({ kind: "advance", label: "Paid", amountMinor: 1, reference: "receipt", expectedVersion: 0, clientRequestId: "375f7b98-9c2b-4ee8-b609-e408bff4a4b0", extra: true }), /invalid_adjustment_input/);
});

test("sanitizes bounded private adjustment data without including reference in public projection", () => {
  const value = sanitizeFeeStatementAdjustmentInput({ kind: "extra_fee", label: "Lab", amountMinor: 50, reference: "internal receipt", expectedVersion: 0, clientRequestId: "375f7b98-9c2b-4ee8-b609-e408bff4a4b0" });
  assert.equal(value.reference, "internal receipt");
  assert.throws(() => calculateFeeStatementBalance(100, [{ kind: "advance", amountMinor: 1 }, { kind: "advance", amountMinor: 101 }]), /invalid_fee_statement_balance/);
});

test("public projection strips private references and rejects corrupted adjustment rows", () => {
  const { projectFeeStatementAdjustment } = require("./fee-statement-adjustments.ts");
  const row = { id: "a", kind: "advance", label: "Paid advance", amount_minor: 50, created_at: "2026-10-01T00:00:00Z", reference: "bank-secret", actor_profile_id: "admin" };
  assert.deepEqual(projectFeeStatementAdjustment(row), { id: "a", kind: "advance", label: "Paid advance", amountMinor: 50, createdAt: "2026-10-01T00:00:00Z" });
  assert.throws(() => projectFeeStatementAdjustment({ ...row, kind: "unknown" }), /invalid_fee_statement_adjustment/);
  assert.throws(() => projectFeeStatementAdjustment({ ...row, amount_minor: -1 }), /invalid_fee_statement_adjustment/);
});

test("does not silently truncate a statement adjustment ledger", async () => {
  const { loadFeeStatementAdjustments } = require("./fee-statement-adjustments.ts");
  let limit;
  const client = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit(value) { limit = value; return Promise.resolve({ data: Array.from({ length: 101 }, () => ({ id: "a", kind: "extra_fee", label: "fee", amount_minor: 1, created_at: "2026-10-01T00:00:00Z" })), error: null }); } }; } };
  await assert.rejects(loadFeeStatementAdjustments(client, "statement"), /fee_statement_adjustment_limit/);
  assert.equal(limit, 101);
});
