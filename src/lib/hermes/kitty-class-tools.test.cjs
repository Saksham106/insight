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

const toolsPath = path.join(__dirname, "kitty-class-tools.ts");
const enrollment = {
  studentContactId: "student-a",
  contacts: [{ contactId: "student-a", role: "student", receivesNotifications: true, confirmsCancellation: true, confirmsReschedule: true }],
};

test("class tool actions retain their admin and contact authority split", () => {
  const tools = fs.readFileSync(toolsPath, "utf8");
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/hermes/class-tools/route.ts"), "utf8");
  for (const action of ["preview_class", "create_class", "list_classes", "get_class", "edit_class", "override_class", "add_enrollment", "end_enrollment"]) {
    assert.ok(tools.includes(`"${action}"`));
  }
  for (const action of ["find_my_classes", "find_my_pending_changes", "confirm_class_selection", "request_class_change", "decide_class_change", "propose_replacement_time"]) {
    assert.ok(tools.includes(`"${action}"`));
  }
  assert.match(route, /verifyServiceRequest/);
  assert.match(route, /parseIMessageAdminActor/);
  assert.match(route, /parseWhatsAppToolActor/);
  assert.match(route, /KITTY_CLASS_CALENDAR_ENABLED/);
  assert.match(route, /communicationDecision/);
});

test("enrollment management actions are admin-only", async () => {
  const { ADMIN_CLASS_ACTIONS, CONTACT_CLASS_ACTIONS, executeKittyClassTool } = require(toolsPath);
  assert.equal(ADMIN_CLASS_ACTIONS.includes("add_enrollment"), true);
  assert.equal(ADMIN_CLASS_ACTIONS.includes("end_enrollment"), true);
  assert.equal(CONTACT_CLASS_ACTIONS.includes("add_enrollment"), false);
  assert.equal(CONTACT_CLASS_ACTIONS.includes("end_enrollment"), false);
  await assert.rejects(() => executeKittyClassTool(
    {},
    { kind: "contact", contactId: "guardian-1", channel: "whatsapp" },
    "add_enrollment",
    { occurrenceId: "occurrence-1", version: 1, effectiveDate: "2026-08-15", enrollment },
  ), /action_not_allowed/);
});

test("class preview consumes teacher, enrollments, and client request id without participants", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const result = await executeKittyClassTool(
    {},
    { kind: "admin", profileId: "profile-1", channel: "imessage" },
    "preview_class",
    {
      kind: "one_off", title: "Group piano", timezone: "America/New_York",
      startsAt: "2026-08-12T20:00:00.000Z", endsAt: "2026-08-12T21:00:00.000Z", localDate: "2026-08-12",
      teacherContactId: "teacher-1", enrollments: [enrollment], clientRequestId: "imessage:create:7",
    },
  );

  assert.equal(result.preview.teacherContactId, "teacher-1");
  assert.deepEqual(result.preview.enrollments, [enrollment]);
  assert.equal(result.preview.clientRequestId, "imessage:create:7");
  assert.equal("participants" in result.preview, false);
});

test("enrollment actions require a version and effective date", async () => {
  const { executeKittyClassTool } = require(toolsPath);
  const actor = { kind: "admin", profileId: "profile-1", channel: "imessage" };
  await assert.rejects(() => executeKittyClassTool({}, actor, "add_enrollment", {
    occurrenceId: "occurrence-1", enrollment,
  }), /invalid_payload/);
  await assert.rejects(() => executeKittyClassTool({}, actor, "end_enrollment", {
    occurrenceId: "occurrence-1", enrollmentId: "enrollment-1", version: 2,
  }), /invalid_payload/);
});
