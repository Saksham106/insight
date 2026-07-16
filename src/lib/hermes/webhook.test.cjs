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

const { filterWebhookPayload, isInboundContactEligible, isWhatsAppOptOut, projectWebhookEvents, verifyMetaSignature } = require(path.join(__dirname, "webhook.ts"));

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

test("builds a Meta-shaped payload containing only explicitly eligible messages", () => {
  const mixed = structuredClone(fixture);
  mixed.entry[0].changes[0].value.contacts.push({ wa_id: "84900000000", profile: { name: "Unknown" } });
  mixed.entry[0].changes[0].value.messages.push({ id: "wamid.blocked", from: "84900000000", timestamp: "1784217601", type: "text", text: { body: "Hello" } });
  const filtered = filterWebhookPayload(mixed, new Set(["wamid.inbound"]));
  const value = filtered.entry[0].changes[0].value;
  assert.deepEqual(value.messages.map((message) => message.id), ["wamid.inbound"]);
  assert.deepEqual(value.contacts.map((contact) => contact.wa_id), ["84917583553"]);
  assert.deepEqual(value.statuses, []);
});

test("drops messages with malformed timestamps instead of assigning 1970", () => {
  const malformed = structuredClone(fixture);
  malformed.entry[0].changes[0].value.messages[0].timestamp = "not-a-time";
  assert.deepEqual(projectWebhookEvents(malformed).filter((event) => event.kind === "message"), []);
});

test("recognizes explicit WhatsApp opt-out commands without guessing from ordinary text", () => {
  assert.equal(isWhatsAppOptOut("STOP"), true);
  assert.equal(isWhatsAppOptOut(" unsubscribe "), true);
  assert.equal(isWhatsAppOptOut("Please stop"), true);
  assert.equal(isWhatsAppOptOut("don't stop trying"), false);
  assert.equal(isWhatsAppOptOut(null), false);
});

test("forwards only imported active consent-attested classified direct contacts", () => {
  const eligible = { isActive: true, consentStatus: "attested", role: "student", communicationPolicy: "direct" };
  assert.equal(isInboundContactEligible(eligible), true);
  assert.equal(isInboundContactEligible({ ...eligible, role: "unclassified" }), false);
  assert.equal(isInboundContactEligible({ ...eligible, isActive: false }), false);
  assert.equal(isInboundContactEligible({ ...eligible, consentStatus: "pending" }), false);
  for (const communicationPolicy of ["paused", "guardian_only", "approval_required", "opted_out"]) {
    assert.equal(isInboundContactEligible({ ...eligible, communicationPolicy }), false);
  }
});

test("webhook route handles verification, raw signatures, idempotency, and forwarding", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/webhook/route.ts"), "utf8");
  assert.match(source, /export async function GET/);
  assert.match(source, /request\.arrayBuffer\(\)/);
  assert.match(source, /verifyMetaSignature/);
  assert.match(source, /idempotency_key/);
  assert.match(source, /HERMES_FORWARD_URL/);
  assert.match(source, /forwarded_at/);
  assert.match(source, /consent_status: "withdrawn"/);
  assert.match(source, /isInboundContactEligible/);
});
