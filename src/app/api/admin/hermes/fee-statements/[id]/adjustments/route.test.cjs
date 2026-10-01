/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const id = "375f7b98-9c2b-4ee8-b609-e408bff4a4b0";
const eventId = "575f7b98-9c2b-4ee8-b609-e408bff4a4b0";
const body = { kind: "advance", label: "Already paid", amountMinor: 50, reference: "receipt 42", expectedVersion: 0, clientRequestId: "475f7b98-9c2b-4ee8-b609-e408bff4a4b0" };
function load({ profile = { id, role: "admin", is_active: true }, rpcError = null, verified = true } = {}) {
  let rpcCalls = 0; let payload; let rows = [];
  const client = { from(table) { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: { id, total_minor: 1000, status: "published" }, error: null }) }; },
    rpc: async (_, input) => { rpcCalls++; payload = input; if (!rpcError && verified) rows = [{ id: eventId, kind: input.p_kind, label: input.p_label, amount_minor: input.p_amount_minor, created_at: "2026-10-01T00:00:00Z" }]; return { data: { id: eventId }, error: rpcError }; },
  };
  const old = Module._load;
  Module._load = function(req, parent, main) {
    if (req === "next/server") return { NextResponse: { json: (b, init = {}) => new Response(JSON.stringify(b), { status: init.status || 200, headers: init.headers }) } };
    if (req === "@/lib/auth/get-user-profile") return { getUserProfile: async () => profile };
    if (req === "@/lib/hermes/fee-statement-adjustments") return old(path.resolve(__dirname, "../../../../../../../lib/hermes/fee-statement-adjustments.ts"), parent, main);
    if (req === "@/lib/supabase/admin") return { createAdminClient: () => client };
    return old(req, parent, main);
  };
  const routePath = path.join(__dirname, "route.ts");
  delete require.cache[routePath]; const r = require(routePath); Module._load = old;
  return { r, rpcCalls: () => rpcCalls, payload: () => payload };
}
const ctx = () => ({ params: Promise.resolve({ id }) });
const request = (value = body, origin = "https://x.test") => new Request("https://x.test", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
test("rejects inactive or non-admin callers and cross-origin requests before RPC", async () => {
  for (const profile of [null, { id, role: "admin", is_active: false }, { id, role: "teacher", is_active: true }]) {
    const { r, rpcCalls } = load({ profile }); assert.equal((await r.POST(request(), ctx())).status, 403); assert.equal(rpcCalls(), 0);
    assert.equal((await r.GET(request(), ctx())).status, 403);
  }
  const { r, rpcCalls } = load(); assert.equal((await r.POST(request(body, "https://evil.test"), ctx())).status, 403); assert.equal(rpcCalls(), 0);
});
test("derives the actor server-side and verifies the exact saved adjustment before success", async () => {
  const { r, payload } = load(); const response = await r.POST(request(), ctx());
  assert.equal(response.status, 200); assert.equal(payload().p_actor_profile_id, id);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const result = await response.json(); assert.equal(result.adjustments[0].id, eventId); assert.equal(result.balance.amountDueMinor, 950);
  assert.doesNotMatch(JSON.stringify(result), /receipt 42/);
});
test("does not report a successful write when exact readback is missing", async () => {
  const { r } = load({ verified: false }); assert.equal((await r.POST(request(), ctx())).status, 500);
});
test("rejects malformed and authority-overriding input", async () => {
  const { r, rpcCalls } = load(); for (const value of [{}, { ...body, actorProfileId: id }]) assert.equal((await r.POST(request(value), ctx())).status, 400);
  assert.equal(rpcCalls(), 0);
});
test("maps stale balances, duplicate receipts and over-applied advances to explicit conflicts", async () => {
  for (const rpcError of [{ message: "stale_fee_statement_adjustments" }, { code: "23505", message: "unique constraint" }, { message: "advance_exceeds_current_due" }]) {
    const { r } = load({ rpcError }); const response = await r.POST(request(), ctx()); assert.equal(response.status, 409); assert.ok((await response.json()).code);
  }
});
