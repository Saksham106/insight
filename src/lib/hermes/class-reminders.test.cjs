/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace(/from\s+["']\.\/([^"']+)["']/g, (match, target) => match.replace(`./${target}`, `./${target}.ts`));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

const { buildClassReminderDeliveries, validateClassDescription } = require(path.join(__dirname, "class-reminders.ts"));

test("renders the other class participants for each reminder recipient", () => {
  const deliveries = buildClassReminderDeliveries({
    occurrence: {
      id: "occ-1",
      subject: "IB Chemistry",
      title: "Chemistry",
      startsAt: "2026-08-12T12:30:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    },
    teacher: { id: "teacher-1", name: "Anjali" },
    students: [{ id: "student-1", name: "Devon" }],
    recipients: [
      { id: "teacher-1", role: "teacher", name: "Anjali" },
      { id: "student-1", role: "student", name: "Devon" },
    ],
  });

  assert.deepEqual(
    deliveries.map(({ recipientName, classDescription }) => ({ recipientName, classDescription })),
    [
      { recipientName: "Anjali", classDescription: "IB Chemistry with Devon" },
      { recipientName: "Devon", classDescription: "IB Chemistry with Anjali" },
    ],
  );
  assert.match(deliveries[0].scheduledDateTime, /Wednesday, August 12/);
  assert.match(deliveries[0].scheduledDateTime, /7:30 PM/);
});

test("joins all active student counterparts for a teacher", () => {
  const [delivery] = buildClassReminderDeliveries({
    occurrence: { id: "occ-1", subject: "Chemistry", title: "Chemistry", startsAt: "2026-08-12T12:30:00.000Z", timezone: "Asia/Ho_Chi_Minh" },
    teacher: { id: "teacher-1", name: "Anjali" },
    students: [{ id: "student-1", name: "Devon" }, { id: "student-2", name: "Mina" }],
    recipients: [{ id: "teacher-1", role: "teacher", name: "Anjali" }],
  });
  assert.equal(delivery.classDescription, "Chemistry with Devon and Mina");
});

test("rejects prose smuggled into a class description", () => {
  assert.throws(
    () => validateClassDescription("IB Chemistry with Anjali. If anything changes"),
    /invalid_class_description/,
  );
  assert.throws(
    () => validateClassDescription("IB Chemistry with the relevant person"),
    /invalid_class_description/,
  );
});

test("rejects a reminder with no genuine counterpart", () => {
  assert.throws(() => buildClassReminderDeliveries({
    occurrence: { id: "occ-1", subject: "Chemistry", title: "Chemistry", startsAt: "2026-08-12T12:30:00.000Z", timezone: "Asia/Ho_Chi_Minh" },
    teacher: { id: "teacher-1", name: "Anjali" },
    students: [],
    recipients: [{ id: "teacher-1", role: "teacher", name: "Anjali" }],
  }), /reminder_counterpart_required/);
});
