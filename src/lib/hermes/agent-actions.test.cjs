/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};

const { evaluateAction, executeEvaluatedAction } = require(path.join(__dirname, "agent-actions.ts"));
const secret = "test-secret-that-is-at-least-32-characters";
const actor = { kind: "contact", contactId: "teacher-1", role: "teacher", channel: "whatsapp" };
const input = { occurrenceId: "occ-1", recipientId: "student-1" };

function dependencies() {
  const rows = new Map();
  let executorCalls = 0;
  const store = {
    async findByActorRequest(actorKey, clientRequestId) {
      return [...rows.values()].find((row) => row.actorKey === actorKey && row.clientRequestId === clientRequestId) ?? null;
    },
    async findById(id) { return rows.get(id) ?? null; },
    async insert(row) { rows.set(row.id, { ...row }); return rows.get(row.id); },
    async claim(id) {
      const row = rows.get(id);
      if (!row || row.executionStatus !== "pending") return null;
      rows.set(id, { ...row, executionStatus: "executing" });
      return rows.get(id);
    },
    async complete(id, result) { rows.set(id, { ...rows.get(id), executionStatus: "completed", result }); return rows.get(id); },
    async fail(id, errorCode) { rows.set(id, { ...rows.get(id), executionStatus: "failed", errorCode }); return rows.get(id); },
  };
  const repository = {
    async loadContact(contactId) {
      return { id: contactId, role: contactId === "teacher-1" ? "teacher" : "student", consentStatus: "attested", communicationPolicy: "direct", isActive: true, version: contactId === "teacher-1" ? 4 : 7 };
    },
    async loadRelationships() { return [{ teacherContactId: "teacher-1", studentContactId: "student-1", status: "active", version: 5 }]; },
    async loadOccurrence() { return { id: "occ-1", version: 9, timezone: "Asia/Ho_Chi_Minh", status: "scheduled", teacherContactId: "teacher-1", studentContactIds: ["student-1"], participantContactIds: ["teacher-1", "student-1"] }; },
  };
  const execute = async ({ normalizedInput }) => { executorCalls += 1; return { sent: true, recipientId: normalizedInput.recipientId }; };
  return { rows, store, repository, execute, get executorCalls() { return executorCalls; } };
}

test("evaluation is idempotent per actor request and rejects a changed payload", async () => {
  const deps = dependencies();
  const proposal = { capabilityName: "class.reminder.send", capabilityVersion: 1, proposedInput: input, clientRequestId: "message-1" };
  const first = await evaluateAction(deps.store, deps.repository, actor, proposal, { secret, now: 1_786_447_200_000 });
  const second = await evaluateAction(deps.store, deps.repository, actor, proposal, { secret, now: 1_786_447_200_100 });
  assert.equal(first.decision.kind, "allowed");
  assert.equal(second.duplicate, true);
  assert.equal(second.evaluationToken, first.evaluationToken);
  await assert.rejects(() => evaluateAction(deps.store, deps.repository, actor, {
    ...proposal, proposedInput: { occurrenceId: "occ-1", recipientId: "teacher-1" },
  }, { secret, now: 1_786_447_200_200 }), /client_request_payload_mismatch/);
});

test("duplicate execution returns the first authoritative result", async () => {
  const deps = dependencies();
  const evaluated = await evaluateAction(deps.store, deps.repository, actor, {
    capabilityName: "class.reminder.send", capabilityVersion: 1, proposedInput: input, clientRequestId: "message-2",
  }, { secret, now: 1_786_447_200_000 });
  const request = { evaluationToken: evaluated.evaluationToken, clientRequestId: "message-2" };
  const first = await executeEvaluatedAction(deps.store, actor, request, { secret, execute: deps.execute, now: 1_786_447_200_100 });
  const second = await executeEvaluatedAction(deps.store, actor, request, { secret, execute: deps.execute, now: 1_786_447_200_200 });
  assert.equal(deps.executorCalls, 1);
  assert.deepEqual(second, { ...first, duplicate: true });
});

test("an evaluation token cannot be transferred to another actor", async () => {
  const deps = dependencies();
  const evaluated = await evaluateAction(deps.store, deps.repository, actor, {
    capabilityName: "class.reminder.send", capabilityVersion: 1, proposedInput: input, clientRequestId: "message-3",
  }, { secret, now: 1_786_447_200_000 });
  await assert.rejects(() => executeEvaluatedAction(deps.store, { ...actor, contactId: "teacher-2" }, {
    evaluationToken: evaluated.evaluationToken, clientRequestId: "message-3",
  }, { secret, execute: deps.execute, now: 1_786_447_200_100 }), /evaluation_actor_mismatch/);
  assert.equal(deps.executorCalls, 0);
});

test("executor failures persist a bounded stable failure", async () => {
  const deps = dependencies();
  const evaluated = await evaluateAction(deps.store, deps.repository, actor, {
    capabilityName: "class.reminder.send", capabilityVersion: 1, proposedInput: input, clientRequestId: "message-4",
  }, { secret, now: 1_786_447_200_000 });
  await assert.rejects(() => executeEvaluatedAction(deps.store, actor, {
    evaluationToken: evaluated.evaluationToken, clientRequestId: "message-4",
  }, { secret, now: 1_786_447_200_100, execute: async () => { throw new Error("private database detail"); } }), /action_execution_failed/);
  assert.equal([...deps.rows.values()][0].errorCode, "action_execution_failed");
});
