/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => { let s = fs.readFileSync(f, "utf8").replace(/from\s+(["'])\.\/([^"']+)\1/g, (_, q, p) => `from ${q}./${p}.ts${q}`); m._compile(ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f); };
const { executeAgentCapability } = require("./agent-capability-executor.ts");
const { feeStatementLookupErrorStatus } = require("./agent-actions.ts");
const profileId = "375f7b98-9c2b-4ee8-b609-e408bff4a4b0";
const statementId = "475f7b98-9c2b-4ee8-b609-e408bff4a4b0";
const actor = { kind: "admin", profileId: null, externalIdHash: "a".repeat(64), channel: "agent_profile" };
const action = { capabilityName: "fee_statement.adjust", capabilityVersion: 1, clientRequestId: "human-readable-stable-request", normalizedInput: { statementId, kind: "extra_fee", label: "Test fee", amountMinor: 200, reference: "PRIVATE receipt reference", expectedVersion: 0 } };
async function withEnv(fn) {
  const keys = ["HERMES_ADMIN_PROFILE_ID", "ACADEMY_AGENT_EVALUATION_SECRET", "NEXT_PUBLIC_APP_URL"];
  const before = keys.map(k => process.env[k]);
  process.env.HERMES_ADMIN_PROFILE_ID = profileId;
  process.env.ACADEMY_AGENT_EVALUATION_SECRET = "test-only-secret-for-invoice-link-that-is-long-enough";
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example";
  try { return await fn(); } finally { keys.forEach((k, i) => before[i] === undefined ? delete process.env[k] : process.env[k] = before[i]); }
}
function mock({ rpcError = null, missingReadback = false, seed = [] } = {}) {
  const calls = [];
  let last;
  const { feeStatementPublicUrl } = require("./fee-statement-link.ts");
  const link = feeStatementPublicUrl("fixture-invoice");
  const client = {
    async rpc(name, payload) { calls.push({ name, payload }); last = payload; return { data: { id: "test-event" }, error: rpcError }; },
    from(table) {
      return { select() { return this; }, eq() { return this; }, async maybeSingle() {
        if (table === "academy_fee_statement_adjustments") return { data: missingReadback ? null : { id: "test-event", statement_id: statementId, kind: last.p_kind, label: last.p_label, amount_minor: last.p_amount_minor }, error: null };
        return { data: { id: statementId, statement_reference: "MIA-QA", status: "published", student_name: "Example", period_start: "2026-09-01", currency: "VND", total_minor: 1000, client_request_id: "fixture-invoice", public_token_hash: link.tokenHash, adjustment_rows: [...seed, { id: "test-event", kind: last.p_kind, label: last.p_label, amount_minor: last.p_amount_minor, created_at: "2026-10-01T00:00:00Z" }] }, error: null };
      } };
    },
  };
  return { client, calls };
}
test("protected profile and verified iMessage use the same canonical owner but stable separate request keys", () => withEnv(async () => {
  const { client, calls } = mock();
  const first = await executeAgentCapability(client, actor, action);
  const retry = await executeAgentCapability(client, actor, action);
  assert.equal(calls[0].payload.p_actor_profile_id, profileId);
  assert.match(calls[0].payload.p_client_request_id, /^[0-9a-f-]{14}8[0-9a-f-]{21}$/);
  assert.equal(calls[0].payload.p_client_request_id, calls[1].payload.p_client_request_id);
  assert.equal(first.publicUrl, retry.publicUrl);
  assert.equal(first.balance.amountDueMinor, 1200);
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE receipt/);
  await executeAgentCapability(client, { ...actor, channel: "imessage" }, action);
  assert.equal(calls[2].payload.p_actor_profile_id, profileId);
  assert.notEqual(calls[2].payload.p_client_request_id, calls[0].payload.p_client_request_id);
}));
test("confirmed full advance returns a zero-due message without another payment request", () => withEnv(async () => {
  const { client } = mock({ seed: [{ id: "fee", kind: "extra_fee", label: "Test", amount_minor: 200, created_at: "2026-10-01T00:00:00Z" }] });
  const result = await executeAgentCapability(client, actor, { ...action, normalizedInput: { ...action.normalizedInput, kind: "advance", amountMinor: 1200, expectedVersion: 1, paymentReceivedConfirmed: true } });
  assert.equal(result.amountDueMinor, 0);
  assert.match(result.whatsappMessage, /nothing is due/);
  assert.doesNotMatch(result.whatsappMessage, /screenshot|total due is/);
}));
test("thrown RPC transport failures are mapped to retryable uncertainty", () => withEnv(async () => {
  const { client } = mock();
  client.rpc = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(executeAgentCapability(client, actor, action), /capability_execution_uncertain/);
}));
test("missing exact readback is retryable and never reports financial success", () => withEnv(async () => {
  const { client } = mock({ missingReadback: true });
  await assert.rejects(executeAgentCapability(client, actor, action), /capability_execution_uncertain/);
}));
test("real database guard codes become clear bounded agent conflicts", () => withEnv(async () => {
  for (const [rpcError, code] of [
    [{ message: "stale_fee_statement_adjustments" }, "fee_statement_adjustment_stale"],
    [{ message: "advance_exceeds_current_due" }, "fee_statement_adjustment_exceeds_balance"],
    [{ message: "fee_statement_ineligible" }, "fee_statement_adjustment_forbidden"],
    [{ code: "23505", message: "duplicate key" }, "fee_statement_adjustment_duplicate_reference"],
  ]) {
    await assert.rejects(executeAgentCapability(mock({ rpcError }).client, actor, action), new RegExp(code));
    assert.equal(feeStatementLookupErrorStatus(code), 409);
  }
}));
