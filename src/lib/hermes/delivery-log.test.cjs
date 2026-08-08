/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const {
  DELIVERY_LOG_PREVIEW_LIMIT,
  projectDeliveryLogRow,
  projectDeliveryLog,
} = require(path.join(__dirname, "delivery-log.ts"));

function message(overrides = {}) {
  return {
    id: overrides.id ?? "message-1",
    direction: overrides.direction ?? "outbound",
    message_kind: overrides.message_kind ?? "text",
    intent: overrides.intent ?? null,
    template_name: overrides.template_name ?? null,
    body: overrides.body ?? null,
    status: overrides.status ?? "delivered",
    error_code: overrides.error_code ?? null,
    occurred_at: overrides.occurred_at ?? "2026-08-07T09:00:00.000Z",
    contact: "contact" in overrides ? overrides.contact : { display_name: "Priya Sharma" },
  };
}

test("an outbound message reads as going to the contact by name", () => {
  const row = projectDeliveryLogRow(message({ direction: "outbound" }));
  assert.equal(row.who, "To Priya Sharma");
});

test("an inbound message reads as coming from the contact by name", () => {
  const row = projectDeliveryLogRow(message({ direction: "inbound", status: "received" }));
  assert.equal(row.who, "From Priya Sharma");
});

test("the contact name replaces the phone number entirely", () => {
  const row = projectDeliveryLogRow(message());
  assert.equal(JSON.stringify(row).includes("+"), false, "no phone number is needed when a name exists");
});

test("a missing contact relation degrades to a safe label instead of throwing", () => {
  const row = projectDeliveryLogRow(message({ contact: null }));
  assert.equal(row.who, "To a removed contact");
  assert.equal(row.contactName, "a removed contact");
});

test("a contact relation with no display name degrades safely", () => {
  const row = projectDeliveryLogRow(message({ contact: { display_name: null } }));
  assert.equal(row.contactName, "a removed contact");
});

test("a relation returned as an array is unwrapped", () => {
  // Supabase returns an embedded many-to-one either as an object or a
  // single-element array depending on how the relationship is inferred.
  const row = projectDeliveryLogRow(message({ contact: [{ display_name: "Anjali" }] }));
  assert.equal(row.contactName, "Anjali");
});

test("an empty relation array degrades safely", () => {
  const row = projectDeliveryLogRow(message({ contact: [] }));
  assert.equal(row.contactName, "a removed contact");
});

test("delivery status is rendered in human-readable words", () => {
  assert.equal(projectDeliveryLogRow(message({ status: "delivered" })).status, "Delivered");
  assert.equal(projectDeliveryLogRow(message({ status: "failed" })).status, "Failed");
  assert.equal(projectDeliveryLogRow(message({ status: "read" })).status, "Read");
  assert.equal(projectDeliveryLogRow(message({ status: "received" })).status, "Received");
});

test("an unrecognised status is still shown readably rather than raw", () => {
  const row = projectDeliveryLogRow(message({ status: "some_new_state" }));
  assert.equal(row.status, "Some new state");
});

test("a template send names the template", () => {
  const row = projectDeliveryLogRow(
    message({ message_kind: "template", template_name: "class_reminder_v3" }),
  );
  assert.match(row.kind, /class reminder v3/i);
});

test("an intent is preferred over the raw message kind", () => {
  const row = projectDeliveryLogRow(message({ intent: "class_reminder" }));
  assert.match(row.kind, /class reminder/i);
});

test("a plain text message with no intent needs no kind label", () => {
  const row = projectDeliveryLogRow(message({ message_kind: "text", intent: null }));
  assert.equal(row.kind, null, "'text' adds nothing a reader does not already know");
});

test("a body preview is bounded", () => {
  const long = "x".repeat(500);
  const row = projectDeliveryLogRow(message({ body: long }));
  assert.ok(row.preview.length <= DELIVERY_LOG_PREVIEW_LIMIT + 1, "preview is truncated");
  assert.ok(row.preview.endsWith("…"), "truncation is signalled");
});

test("a short body is previewed whole without an ellipsis", () => {
  const row = projectDeliveryLogRow(message({ body: "See you Tuesday" }));
  assert.equal(row.preview, "See you Tuesday");
});

test("a body of only whitespace yields no preview", () => {
  assert.equal(projectDeliveryLogRow(message({ body: "   " })).preview, null);
});

test("newlines in a body preview are flattened to keep rows compact", () => {
  const row = projectDeliveryLogRow(message({ body: "Line one\n\nLine two" }));
  assert.equal(row.preview.includes("\n"), false);
});

test("a failed delivery is flagged as actionable and carries its error code", () => {
  const row = projectDeliveryLogRow(message({ status: "failed", error_code: "131047" }));
  assert.equal(row.failed, true);
  assert.equal(row.errorCode, "131047");
});

test("a delivered message is not flagged as actionable", () => {
  assert.equal(projectDeliveryLogRow(message({ status: "delivered" })).failed, false);
});

test("the projection never carries raw payloads, tokens, or internal detail", () => {
  const row = projectDeliveryLogRow({
    ...message({ status: "failed", error_code: "131047" }),
    error_detail: "at Object.<anonymous> (/srv/app/webhook.ts:41:9)",
    meta_message_id: "wamid.HBgLOTE5ODc2NTQzMjEwFQIAERgSN0Y",
    idempotency_key: "secret-key-1",
    raw_payload: { token: "EAAG...redacted" },
  });
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes("wamid"), false, "no external message id");
  assert.equal(serialized.includes("secret-key-1"), false, "no idempotency key");
  assert.equal(serialized.includes("EAAG"), false, "no token");
  assert.equal(serialized.includes("webhook.ts"), false, "no stack trace");
});

test("the log keeps its conservative row bound", () => {
  const rows = projectDeliveryLog(Array.from({ length: 60 }, (_, index) => message({ id: `m-${index}` })));
  assert.ok(rows.length <= 25, "the existing 25-row bound is preserved");
});

test("the log preserves the order it is given", () => {
  const rows = projectDeliveryLog([
    message({ id: "newest", occurred_at: "2026-08-07T10:00:00.000Z" }),
    message({ id: "older", occurred_at: "2026-08-07T09:00:00.000Z" }),
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["newest", "older"]);
});

test("an empty log projects to an empty list", () => {
  assert.deepEqual(projectDeliveryLog([]), []);
});
