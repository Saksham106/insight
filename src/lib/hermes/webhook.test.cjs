/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { createHmac } = require("node:crypto");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { projectWebhookEvents, verifyMetaSignature } = require(path.join(__dirname, "webhook.ts"));

const fixture = {
  object: "whatsapp_business_account",
  entry: [{ id: "waba", changes: [{ field: "messages", value: {
    contacts: [{ wa_id: "84917583553", profile: { name: "Swati" } }],
    messages: [{ id: "wamid.inbound", from: "84917583553", timestamp: "1784217600", type: "text", text: { body: "Hello" } }],
    statuses: [{ id: "wamid.outbound", status: "delivered", timestamp: "1784217610", recipient_id: "84917583553" }],
  } }] }],
};

test("verifies the exact raw Meta body signature", () => {
  const raw = Buffer.from(JSON.stringify(fixture));
  const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  assert.equal(verifyMetaSignature(raw, signature, "app-secret"), true);
  assert.equal(verifyMetaSignature(Buffer.from(`${raw} `), signature, "app-secret"), false);
  assert.equal(verifyMetaSignature(raw, "sha256=bad", "app-secret"), false);
});

test("projects supported message and status events with deterministic keys", () => {
  assert.deepEqual(projectWebhookEvents(fixture), [
    { kind: "message", idempotencyKey: "meta:message:wamid.inbound", metaMessageId: "wamid.inbound", waId: "84917583553", profileName: "Swati", occurredAt: "2026-07-16T16:00:00.000Z", messageType: "text", body: "Hello" },
    { kind: "status", idempotencyKey: "meta:status:wamid.outbound:delivered:1784217610", metaMessageId: "wamid.outbound", waId: "84917583553", occurredAt: "2026-07-16T16:00:10.000Z", status: "delivered", errorCode: null },
  ]);
});

test("ignores malformed and unsupported changes without throwing", () => {
  assert.deepEqual(projectWebhookEvents({ entry: [{ changes: [{ field: "account_update", value: {} }] }] }), []);
  assert.deepEqual(projectWebhookEvents(null), []);
});

test("webhook route handles verification, raw signatures, idempotency, and forwarding", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/webhook/route.ts"), "utf8");
  assert.match(source, /export async function GET/);
  assert.match(source, /request\.arrayBuffer\(\)/);
  assert.match(source, /verifyMetaSignature/);
  assert.match(source, /idempotency_key/);
  assert.match(source, /HERMES_FORWARD_URL/);
  assert.match(source, /forwarded_at/);
});
