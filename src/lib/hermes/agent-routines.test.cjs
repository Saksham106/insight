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

const { expandAgentReminderRoutine, normalizeAgentRoutineInput } = require(path.join(__dirname, "agent-routines.ts"));

test("normalizes a series-relative reminder routine as disabled and ID-only", () => {
  assert.deepEqual(normalizeAgentRoutineInput({
    routineKey: "anjali-devon-24h", capabilityName: "class.reminder.send", capabilityVersion: 1,
    seriesId: "series-1", offsetMinutes: -1440, timezone: "Asia/Ho_Chi_Minh",
  }), {
    routineKey: "anjali-devon-24h", capabilityName: "class.reminder.send", capabilityVersion: 1,
    entityReferences: { seriesId: "series-1" }, schedule: { kind: "relative_to_occurrence", offsetMinutes: -1440 },
    timezone: "Asia/Ho_Chi_Minh", recipientRule: { kind: "class_participants" }, status: "disabled",
  });
  assert.throws(() => normalizeAgentRoutineInput({ routineKey: "x", capabilityName: "class.one_off.create", capabilityVersion: 1, seriesId: "series-1", offsetMinutes: -1440, timezone: "UTC" }), /capability_not_schedulable/);
});

test("expands current participants into separately evaluated reminder actions", () => {
  const preview = expandAgentReminderRoutine({
    occurrence: { id: "occ-1", subject: "IB Chemistry", title: "Chemistry", startsAt: "2026-08-12T12:30:00.000Z", timezone: "Asia/Ho_Chi_Minh" },
    teacher: { id: "teacher-1", name: "Anjali" }, students: [{ id: "student-1", name: "Devon" }],
    recipients: [{ id: "teacher-1", role: "teacher", name: "Anjali" }, { id: "student-1", role: "student", name: "Devon" }],
  }, "routine-1");
  assert.deepEqual(preview.actions.map((action) => action.proposedInput), [
    { occurrenceId: "occ-1", recipientId: "teacher-1" },
    { occurrenceId: "occ-1", recipientId: "student-1" },
  ]);
  assert.deepEqual(preview.actions.map((action) => action.classDescription), ["IB Chemistry with Devon", "IB Chemistry with Anjali"]);
  assert.equal(JSON.stringify(preview).includes("relevant person is"), false);
  assert.equal(preview.actions[0].clientRequestId, "routine:routine-1:occ-1:teacher-1");
});
