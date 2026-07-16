/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) => match.replace(`./${target}`, `./${target}.ts`));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { buildGraphMessageRequest, classifyMetaFailure, selectWhatsAppDelivery } = require(path.join(__dirname, "meta.ts"));

const templates = {
  availability_request: { name: "class_availability_request", locale: "en_US" },
  time_proposal: { name: "class_time_proposal", locale: "en_US" },
};

function contact(extra = {}) {
  return {
    whatsappE164: "+84917583553",
    communicationPolicy: "direct",
    consentStatus: "attested",
    serviceWindowExpiresAt: "2026-07-16T18:00:00.000Z",
    ...extra,
  };
}

test("uses free-form delivery only inside that recipient's open service window", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact(), "availability_request", new Date("2026-07-16T17:00:00Z"), templates), { kind: "free_form" });
  assert.deepEqual(selectWhatsAppDelivery(contact(), "availability_request", new Date("2026-07-16T19:00:00Z"), templates), { kind: "template", name: "class_availability_request", locale: "en_US" });
});

test("fails closed for communication policy and consent restrictions", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "paused" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "paused" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "guardian_only" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "guardian_only" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ communicationPolicy: "approval_required" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "approval_required" });
  assert.deepEqual(selectWhatsAppDelivery(contact({ consentStatus: "withdrawn" }), "availability_request", new Date(), templates), { kind: "blocked", reason: "opted_out" });
});

test("fails closed when a required approved template is missing", () => {
  assert.deepEqual(selectWhatsAppDelivery(contact({ serviceWindowExpiresAt: null }), "class_confirmation", new Date(), templates), { kind: "blocked", reason: "template_unavailable" });
});

test("builds fixed text and template Graph payloads", () => {
  assert.deepEqual(buildGraphMessageRequest({ to: "+84 917 583 553", delivery: { kind: "free_form" }, body: "Hello" }), {
    messaging_product: "whatsapp", recipient_type: "individual", to: "84917583553", type: "text", text: { preview_url: false, body: "Hello" },
  });
  assert.deepEqual(buildGraphMessageRequest({ to: "+84917583553", delivery: { kind: "template", name: "class_time_proposal", locale: "en_US" }, bodyParameters: ["Priya", "Tuesday 6 PM"] }), {
    messaging_product: "whatsapp", recipient_type: "individual", to: "84917583553", type: "template", template: { name: "class_time_proposal", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }, { type: "text", text: "Tuesday 6 PM" }] }] },
  });
});

test("classifies bounded retry versus permanent Meta failures", () => {
  assert.equal(classifyMetaFailure(500, 2), "retryable");
  assert.equal(classifyMetaFailure(429, 4), "retryable");
  assert.equal(classifyMetaFailure(400, 131047), "permanent");
  assert.equal(classifyMetaFailure(401, 190), "permanent");
});

test("sender route is internal-authenticated and idempotent", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/whatsapp/send/route.ts"), "utf8");
  assert.match(source, /verifyServiceRequest/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /hermes_messages/);
});
