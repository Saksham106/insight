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

const { parseAgentCapabilityRequest } = require(path.join(__dirname, "agent-capability-request.ts"));

test("accepts only the three generic capability operations", () => {
  assert.deepEqual(parseAgentCapabilityRequest({ actor: { platform: "whatsapp" }, operation: "list_capabilities", payload: {} }).operation, "list_capabilities");
  assert.deepEqual(parseAgentCapabilityRequest({ actor: {}, operation: "evaluate_action", payload: { capabilityName: "class.reminder.send", capabilityVersion: 1, proposedInput: { occurrenceId: "occ-1", recipientId: "student-1" }, clientRequestId: "message-1" } }).payload.clientRequestId, "message-1");
  assert.deepEqual(parseAgentCapabilityRequest({ actor: {}, operation: "execute_action", payload: { evaluationToken: "token", clientRequestId: "message-1" } }).operation, "execute_action");
});

test("rejects unknown fields and authorization overrides", () => {
  for (const value of [
    { actor: {}, operation: "evaluate_action", payload: { capabilityName: "x", capabilityVersion: 1, proposedInput: {}, clientRequestId: "id", role: "admin" } },
    { actor: {}, operation: "execute_action", payload: { evaluationToken: "token", clientRequestId: "id", contactId: "other" } },
    { actor: {}, operation: "run_sql", payload: {} },
    { actor: {}, operation: "list_capabilities", payload: {}, extra: true },
  ]) assert.throws(() => parseAgentCapabilityRequest(value), /invalid_capability_request/);
});
