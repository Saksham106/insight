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

const { buildApprovalTemplateMessage, generateApprovalCode, parseApprovalReply, summarizeApprovalPayload } = require(path.join(__dirname, "whatsapp-approvals.ts"));

test("generates fixed non-ambiguous six-character approval codes", () => {
  assert.equal(generateApprovalCode(Buffer.from([0, 1, 2, 3, 4, 31])), "ABCDE9");
  assert.match(generateApprovalCode(Buffer.alloc(6, 255)), /^[A-HJ-NP-Z2-9]{6}$/);
});

test("accepts only exact coded text or generated button identifiers", () => {
  assert.deepEqual(parseApprovalReply({ body: "APPROVE ABCD23" }), { decision: "approved", code: "ABCD23" });
  assert.deepEqual(parseApprovalReply({ body: "reject abcd23" }), { decision: "rejected", code: "ABCD23" });
  assert.deepEqual(parseApprovalReply({ interactiveId: "approval:approve:ABCD23" }), { decision: "approved", code: "ABCD23" });
  assert.deepEqual(parseApprovalReply({ interactiveId: "approval:reject:ABCD23" }), { decision: "rejected", code: "ABCD23" });
  for (const body of ["yes", "approve", "APPROVE  ABCD23", "APPROVE ABCD23 please", "👍", "APPROVE IIIIII"]) {
    assert.equal(parseApprovalReply({ body }), null);
  }
  assert.equal(parseApprovalReply({ interactiveId: "approval:approve:ABCD23:extra" }), null);
});

test("summarizes only the exact class interval", () => {
  assert.deepEqual(summarizeApprovalPayload({ start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z", timezone: "Asia/Ho_Chi_Minh", student: "drop", transcript: "drop" }), {
    start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z", timezone: "Asia/Ho_Chi_Minh",
  });
  assert.throws(() => summarizeApprovalPayload({ start: "bad", end: "bad", timezone: "UTC" }), /invalid_approval_payload/);
});

test("builds a fixed utility template with two code-bound quick replies", () => {
  const result = buildApprovalTemplateMessage({
    to: "+84 917 583 553", templateName: "kitty_class_approval", locale: "en_US", code: "ABCD23",
    approvalPayload: { start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z", timezone: "UTC", private: "drop" },
  });
  assert.equal(result.to, "84917583553");
  assert.equal(result.type, "template");
  assert.deepEqual(result.template.components[1], { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "approval:approve:ABCD23" }] });
  assert.deepEqual(result.template.components[2], { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "approval:reject:ABCD23" }] });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("summarizes an exact settlement without exposing family or tutor details", () => {
  const payload = {
    periodStart: "2026-06-01",
    currency: "VND",
    version: 2,
    familyInvoices: [{ billedContactId: "private", studentContactId: "private", totalMinor: 850000, items: [{ private: true }] }],
    tutorPayouts: [{ tutorContactId: "private", reportId: "private", amountMinor: 550000 }],
  };
  assert.deepEqual(summarizeApprovalPayload(payload), {
    periodStart: "2026-06-01", currency: "VND", familyTotalMinor: 850000, tutorTotalMinor: 550000,
  });
  const result = buildApprovalTemplateMessage({ to: "+84917583553", templateName: "kitty_settlement_approval", locale: "en_US", code: "ABCD23", approvalPayload: payload });
  const serialized = JSON.stringify(result);
  assert.match(serialized, /850000/);
  assert.match(serialized, /550000/);
  assert.equal(serialized.includes("billedContactId"), false);
  assert.equal(serialized.includes("tutorContactId"), false);
});
