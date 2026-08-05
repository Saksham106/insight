/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("only provider-accepted WhatsApp states are truthful duplicate success", () => {
  const source = fs.readFileSync(path.join(__dirname, "whatsapp-delivery-state.ts"), "utf8");
  assert.match(source, /"accepted", "sent", "delivered", "read"/);
  assert.match(source, /message\.status === "failed"/);
  assert.match(source, /Automatic resend would create a duplicate message/);
  assert.doesNotMatch(source, /SUCCESSFUL_STATES.*pending/);
});

test("the sender retries failed records but quarantines indeterminate pending records", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/send/route.ts"), "utf8");
  assert.match(source, /priorWhatsAppDisposition/);
  assert.match(source, /priorDisposition === "success"/);
  assert.match(source, /priorDisposition === "in_flight"/);
  assert.match(source, /\.eq\("status", "failed"\)/);
  assert.match(source, /blocked: true/);
  assert.match(source, /Provider acceptance could not be persisted/);
  assert.match(source, /provider_payload_digest/);
  assert.match(source, /Idempotency key provider payload mismatch/);
});
