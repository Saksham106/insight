/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+(["'])\.\/([^"']+)\1/g, (_match, quote, target) => `from ${quote}./${target}.ts${quote}`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const { evaluateAgentAction } = require(path.join(__dirname, "agent-policy.ts"));

const contacts = {
  "teacher-1": { id: "teacher-1", role: "teacher", consentStatus: "attested", communicationPolicy: "direct", isActive: true, version: 4 },
  "teacher-2": { id: "teacher-2", role: "teacher", consentStatus: "attested", communicationPolicy: "direct", isActive: true, version: 1 },
  "teacher-3": { id: "teacher-3", role: "teacher", consentStatus: "attested", communicationPolicy: "direct", isActive: false, version: 2 },
  "student-1": { id: "student-1", role: "student", consentStatus: "attested", communicationPolicy: "direct", isActive: true, version: 7 },
  "parent-1": { id: "parent-1", role: "parent", consentStatus: "attested", communicationPolicy: "direct", isActive: true, version: 3 },
};
const relationships = [
  { teacherContactId: "teacher-1", studentContactId: "student-1", relationshipType: "teacher_student", status: "active", version: 5 },
  { contactId: "parent-1", representedStudentId: "student-1", relationshipType: "parent_student", status: "active", version: 2 },
];
const occurrence = {
  id: "occ-1", version: 9, timezone: "Asia/Ho_Chi_Minh", status: "scheduled",
  teacherContactId: "teacher-1", studentContactIds: ["student-1"], participantContactIds: ["teacher-1", "student-1", "parent-1"],
};

function repository(overrides = {}) {
  return {
    async loadContact(contactId) { return overrides.contacts?.[contactId] ?? contacts[contactId] ?? null; },
    async loadRelationships(contactId) { return (overrides.relationships ?? relationships).filter((item) => Object.values(item).includes(contactId)); },
    async loadOccurrence(occurrenceId) { return occurrenceId === occurrence.id ? (overrides.occurrence ?? occurrence) : null; },
  };
}

function actor(contactId, role) {
  return { kind: "contact", contactId, role, channel: "whatsapp" };
}

async function decide(agentActor, capabilityName, proposedInput, repo = repository()) {
  return evaluateAgentAction({ actor: agentActor, capabilityName, capabilityVersion: 1, proposedInput, repository: repo });
}

test("allows routine teacher and student actions only inside verified relationships", async () => {
  const cases = [
    ["linked teacher one-off", actor("teacher-1", "teacher"), "class.one_off.create", { title: "Chemistry", timezone: "Asia/Ho_Chi_Minh", startsAt: "2026-08-13T12:30:00Z", endsAt: "2026-08-13T13:30:00Z", localDate: "2026-08-13", studentContactIds: ["student-1"] }, "allowed"],
    ["unlinked teacher one-off", actor("teacher-2", "teacher"), "class.one_off.create", { title: "Chemistry", timezone: "Asia/Ho_Chi_Minh", startsAt: "2026-08-13T12:30:00Z", endsAt: "2026-08-13T13:30:00Z", localDate: "2026-08-13", studentContactIds: ["student-1"] }, "denied"],
    ["student self reschedule", actor("student-1", "student"), "class.reschedule.request", { occurrenceId: "occ-1", selectionToken: "token", scope: "individual_reschedule" }, "allowed"],
    ["linked teacher reminder", actor("teacher-1", "teacher"), "class.reminder.send", { occurrenceId: "occ-1", recipientId: "student-1" }, "allowed"],
    ["removed teacher reminder", actor("teacher-3", "teacher"), "class.reminder.send", { occurrenceId: "occ-1", recipientId: "student-1" }, "denied"],
    ["parent represented reminder", actor("parent-1", "parent"), "class.reminder.send", { occurrenceId: "occ-1", recipientId: "parent-1" }, "allowed"],
  ];
  for (const [label, agentActor, capabilityName, input, expected] of cases) {
    const decision = await decide(agentActor, capabilityName, input);
    assert.equal(decision.kind, expected, label);
  }
});

test("returns bounded clarification for a missing timezone", async () => {
  const decision = await decide(actor("teacher-1", "teacher"), "class.one_off.create", {
    title: "Chemistry", startsAt: "2026-08-13T12:30:00Z", endsAt: "2026-08-13T13:30:00Z", localDate: "2026-08-13", studentContactIds: ["student-1"],
  });
  assert.deepEqual(decision, { kind: "needs_clarification", missingFields: ["timezone"], reasonCode: "missing_required_fields" });
});

test("denies capabilities and actor kinds outside the published boundary", async () => {
  assert.deepEqual(await decide(actor("teacher-1", "teacher"), "routine.manage", { operation: "create", routine: {} }), {
    kind: "denied", reasonCode: "action_out_of_scope",
  });
  assert.deepEqual(await decide(actor("teacher-1", "teacher"), "class.series.edit", {}), {
    kind: "denied", reasonCode: "action_out_of_scope",
  });
  assert.deepEqual(await decide(actor("teacher-1", "teacher"), "payment.record", {}), {
    kind: "denied", reasonCode: "action_out_of_scope",
  });
});

test("fails closed for opted-out contacts and unrelated reminder recipients", async () => {
  const optedOut = repository({ contacts: {
    ...contacts,
    "teacher-1": { ...contacts["teacher-1"], communicationPolicy: "opted_out" },
  } });
  assert.equal((await decide(actor("teacher-1", "teacher"), "class.reminder.send", { occurrenceId: "occ-1", recipientId: "student-1" }, optedOut)).reasonCode, "communication_blocked");
  assert.equal((await decide(actor("teacher-2", "teacher"), "class.reminder.send", { occurrenceId: "occ-1", recipientId: "student-1" })).reasonCode, "relationship_required");
});

test("administrator routine management is allowed but remains separately evaluated", async () => {
  const decision = await decide({ kind: "admin", profileId: "swati", channel: "imessage" }, "routine.manage", { operation: "disable", routineId: "routine-1" });
  assert.equal(decision.kind, "allowed");
  assert.deepEqual(decision.normalizedInput, { operation: "disable", routineId: "routine-1" });
});

test("fee statement replacement asks for missing correction fields before normalization", async () => {
  const decision = await decide(
    { kind: "admin", profileId: "swati", channel: "imessage" },
    "fee_statement.replace",
    { studentName: "Devon", periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "VND", lineItems: [] },
  );
  assert.deepEqual(decision, {
    kind: "needs_clarification",
    missingFields: ["correctionReason"],
    reasonCode: "missing_required_fields",
  });
});
