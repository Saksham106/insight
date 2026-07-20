/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { normalizeToolPayload } = require(path.join(__dirname, "tool-contracts.ts"));

test("normalizes observed scheduling aliases to canonical camelCase", () => {
  assert.deepEqual(normalizeToolPayload("send_message", {
    case_id: "case-1",
    contact_id: "contact-1",
    idempotency_key: "message-1",
    body_parameters: ["A", "B"],
    template_data: { classDescription: "Math" },
  }), {
    caseId: "case-1",
    contactId: "contact-1",
    idempotencyKey: "message-1",
    bodyParameters: ["A", "B"],
    templateData: { classDescription: "Math" },
  });
});

test("canonical values win when an alias is also present", () => {
  assert.deepEqual(normalizeToolPayload("get_case", { caseId: "canonical", case_id: "legacy" }), { caseId: "canonical" });
});

test("normalization is shallow and does not rewrite arbitrary nested business data", () => {
  const resolution = { case_id: "external-reference", nested: { contact_id: "keep-me" } };
  assert.deepEqual(normalizeToolPayload("decide_approval", { approval_id: "approval-1", resolution }), {
    approvalId: "approval-1",
    resolution,
  });
});

test("normalizes declared participant objects without touching unknown fields", () => {
  assert.deepEqual(normalizeToolPayload("create_case", {
    tutor_kind: "swati",
    requested_by_contact_id: "contact-1",
    participants: [{ contact_id: "contact-1", participant_role: "student", note: "unchanged" }],
  }), {
    tutorKind: "swati",
    requestedByContactId: "contact-1",
    participants: [{ contactId: "contact-1", participantRole: "student", note: "unchanged" }],
  });
});
